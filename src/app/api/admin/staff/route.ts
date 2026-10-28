import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, logAdminFailure, requireStaffRequest, type VerifiedStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError, withApiErrors } from "@/lib/server/api-errors";
import { writeAudit } from "@/lib/server/audit";
import { USER_ROLES, type UserRole } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

const role = z.enum(USER_ROLES);
const password = z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(64);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(120), password, role }).strict(),
  z.object({ action: z.literal("update"), uid: z.string().min(1).max(128), name: z.string().trim().min(2).max(80).optional(), role: role.optional(), isActive: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("password"), uid: z.string().min(1).max(128), password }).strict()
]);

interface AdminAuth {
  createUser(input: { email: string; password: string; displayName?: string }): Promise<{ uid: string }>;
  getUserByEmail(email: string): Promise<{ uid: string }>;
  updateUser(uid: string, input: { password?: string; displayName?: string; disabled?: boolean }): Promise<unknown>;
  revokeRefreshTokens?(uid: string): Promise<void>;
}
type Db = any;

const fail = (message: string, status: number, code?: string) => Object.assign(new Error(message), { status, code });

/** Managers handle the floor team; only an administrator creates or changes another administrator. */
function canManage(staff: VerifiedStaffRequest, target: UserRole): boolean {
  return staff.staffUser.role === "admin" || target !== "admin";
}

async function list(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const snap = await (getAdminFirestore() as Db).collection("staffUsers").where("restaurantId", "==", staff.staffUser.restaurantId).get();
  const team = snap.docs.map((doc: Db) => {
    const data = doc.data();
    return { uid: doc.id, name: String(data.name ?? ""), email: String(data.email ?? ""), role: USER_ROLES.includes(data.role) ? data.role : "attendant", isActive: data.isActive === true, createdAt: data.createdAt ?? null, isMe: doc.id === staff.uid };
  }).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR"));
  return NextResponse.json({ team }, { headers: { "Cache-Control": "no-store" } });
}

async function change(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message;
    return NextResponse.json({ error: message && !message.startsWith("Invalid") && !message.startsWith("Too") ? message : "Confira nome, e-mail, senha (mínimo 8) e função." }, { status: 400 });
  }
  const db = getAdminFirestore() as Db;
  const auth = getFirebaseAdminAuth() as AdminAuth;
  const restaurantId = staff.staffUser.restaurantId;
  const now = new Date().toISOString();
  const body = parsed.data;
  const audit = (type: string, message: string, metadata: Record<string, unknown>) => writeAudit(db, { restaurantId, actorId: staff.uid, actorName: staff.staffUser.name ?? null, type, message, metadata });

  try {
    if (body.action === "create") {
      if (!canManage(staff, body.role)) throw fail("Só um administrador pode cadastrar outro administrador.", 403);
      let uid: string;
      let reused = false;
      try {
        uid = (await auth.createUser({ email: body.email, password: body.password, displayName: body.name })).uid;
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/email-already-exists") throw error;
        // The login already exists (e.g. created in the Firebase console): link it to the team.
        uid = (await auth.getUserByEmail(body.email)).uid;
        reused = true;
      }
      const ref = db.collection("staffUsers").doc(uid);
      const existing = await ref.get();
      if (existing.exists && existing.data().restaurantId && existing.data().restaurantId !== restaurantId) throw fail("Este e-mail já é da equipe de outro restaurante.", 409, "other_restaurant");
      if (existing.exists && existing.data().restaurantId === restaurantId && existing.data().isActive === true) throw fail("Esta pessoa já está na equipe.", 409, "already_member");
      // Only a former member of this restaurant gets the new password. Any other existing
      // login keeps its own password: resetting it would let whoever knows the e-mail take the account.
      const formerMember = reused && existing.exists && existing.data().restaurantId === restaurantId;
      if (formerMember) await auth.updateUser(uid, { password: body.password, displayName: body.name, disabled: false });
      await ref.set({ uid, name: body.name, email: body.email, role: body.role, restaurantId, isActive: true, createdBy: staff.uid, ...(existing.exists ? {} : { createdAt: now }), updatedAt: now }, { merge: true });
      await audit("staff_created", `${body.name} entrou na equipe como ${body.role}`, { uid, email: body.email, role: body.role });
      return NextResponse.json({ ok: true, uid, reused, passwordKept: reused && !formerMember }, { status: 201 });
    }

    const ref = db.collection("staffUsers").doc(body.uid);
    const snap = await ref.get();
    if (!snap.exists || snap.data().restaurantId !== restaurantId) throw fail("Pessoa não encontrada na equipe.", 404);
    const current = snap.data();
    if (!canManage(staff, current.role) || (body.action === "update" && body.role && !canManage(staff, body.role))) throw fail("Só um administrador pode alterar um administrador.", 403);

    if (body.action === "password") {
      await auth.updateUser(body.uid, { password: body.password });
      await auth.revokeRefreshTokens?.(body.uid);
      await ref.update({ passwordChangedAt: now, updatedAt: now });
      await audit("staff_password", `Senha de ${current.name ?? current.email} trocada`, { uid: body.uid });
      return NextResponse.json({ ok: true });
    }

    const me = body.uid === staff.uid;
    if (me && body.isActive === false) throw fail("Você não pode desativar o seu próprio acesso.", 400);
    if (me && body.role && body.role !== current.role) throw fail("Peça a outro administrador para mudar a sua função.", 400);
    if (current.role === "admin" && (body.isActive === false || (body.role && body.role !== "admin"))) {
      const admins = await db.collection("staffUsers").where("restaurantId", "==", restaurantId).where("role", "==", "admin").get();
      const activeAdmins = admins.docs.filter((doc: Db) => doc.data().isActive === true && doc.id !== body.uid);
      if (activeAdmins.length === 0) throw fail("O restaurante precisa de pelo menos um administrador ativo.", 400);
    }
    const patch = { ...(body.name ? { name: body.name } : {}), ...(body.role ? { role: body.role } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}), updatedAt: now };
    await ref.update(patch);
    // Deactivated people are logged out of every device on the next token refresh.
    if (body.isActive === false) await auth.revokeRefreshTokens?.(body.uid);
    if (body.isActive !== undefined) await auth.updateUser(body.uid, { disabled: !body.isActive }).catch(() => undefined);
    const changes = [body.role && body.role !== current.role ? `função ${current.role} → ${body.role}` : null, body.isActive === false ? "acesso tirado" : body.isActive === true && current.isActive !== true ? "acesso devolvido" : null, body.name && body.name !== current.name ? "nome alterado" : null].filter(Boolean);
    if (changes.length) await audit("staff_updated", `${current.name ?? current.email}: ${changes.join(", ")}`, { uid: body.uid, before: { role: current.role, isActive: current.isActive }, after: patch });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = error as { status?: number; code?: string };
    if (failure.status) return NextResponse.json({ error: (error as Error).message, code: failure.code }, { status: failure.status });
    const code = failure.code ?? "";
    if (code === "auth/invalid-password" || code === "auth/weak-password") return NextResponse.json({ error: "Senha fraca: use pelo menos 8 caracteres." }, { status: 400 });
    if (code === "auth/invalid-email") return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    if (code === "auth/operation-not-allowed" || code === "auth/configuration-not-found") return NextResponse.json({ error: "O login por e-mail e senha está desligado no Firebase. Ative em Authentication → Sign-in method → E-mail/senha." }, { status: 503, headers: {} });
    logAdminFailure(staff.requestId, "staff_change", error);
    const classified = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível salvar a equipe.", code: classified.code, hint: classified.hint }, { status: classified.status });
  }
}

export const GET = withApiErrors("admin/staff", list, "Não foi possível carregar a equipe.");
export const POST = withApiErrors("admin/staff", change, "Não foi possível salvar a equipe.");
