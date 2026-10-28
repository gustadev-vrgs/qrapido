import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { withApiErrors } from "@/lib/server/api-errors";
import { requirePlatformAdmin } from "@/lib/server/platform-auth";
import { defaultRestaurantSettings } from "@/lib/server/restaurant-defaults";

export const dynamic = "force-dynamic";

type Db = any;

const slug = z.string().trim().toLowerCase().min(3, "O identificador precisa de pelo menos 3 letras.").max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen (ex.: restaurante-da-ana).");
const schema = z.object({
  restaurantName: z.string().trim().min(2, "Informe o nome do restaurante.").max(80),
  restaurantId: slug,
  adminName: z.string().trim().min(2, "Informe o nome do responsável.").max(80),
  adminEmail: z.string().trim().toLowerCase().email("E-mail do responsável inválido.").max(120),
  adminPassword: z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(64)
}).strict();

interface AdminAuth {
  createUser(input: { email: string; password: string; displayName?: string }): Promise<{ uid: string }>;
  getUserByEmail(email: string): Promise<{ uid: string }>;
}

const fail = (message: string, status: number, code?: string) => Object.assign(new Error(message), { status, code });

/** Every restaurant on the platform, with how many active team members it has. */
async function list(request: NextRequest): Promise<NextResponse> {
  const admin = await requirePlatformAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const db = getAdminFirestore() as Db;
  const [restaurants, staff] = await Promise.all([db.collection("restaurants").get(), db.collection("staffUsers").where("isActive", "==", true).get()]);
  const teamSize = new Map<string, number>();
  staff.docs.forEach((doc: Db) => { const id = doc.data().restaurantId; if (id) teamSize.set(id, (teamSize.get(id) ?? 0) + 1); });
  const items = restaurants.docs
    .map((doc: Db) => ({ id: doc.id, name: String(doc.data().name ?? doc.id), isActive: doc.data().isActive !== false, createdAt: doc.data().createdAt ?? null, team: teamSize.get(doc.id) ?? 0 }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR"));
  return NextResponse.json({ restaurants: items, email: admin.email }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Creates a restaurant ready to use: its record, default settings and the first
 * administrator's login. An e-mail that already has a login keeps its own password.
 */
async function create(request: NextRequest): Promise<NextResponse> {
  const admin = await requirePlatformAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Confira os dados." }, { status: 400 });
  const body = parsed.data;
  const db = getAdminFirestore() as Db;
  const auth = getFirebaseAdminAuth() as AdminAuth;
  const now = new Date().toISOString();

  try {
    const restaurantRef = db.collection("restaurants").doc(body.restaurantId);
    if ((await restaurantRef.get()).exists) throw fail("Já existe um restaurante com este identificador. Escolha outro.", 409, "restaurant_exists");

    let uid: string;
    let passwordKept = false;
    try {
      uid = (await auth.createUser({ email: body.adminEmail, password: body.adminPassword, displayName: body.adminName })).uid;
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/email-already-exists") throw error;
      uid = (await auth.getUserByEmail(body.adminEmail)).uid;
      passwordKept = true;
    }
    const staffRef = db.collection("staffUsers").doc(uid);
    const existing = await staffRef.get();
    if (existing.exists && existing.data().restaurantId && existing.data().isActive !== false) throw fail("Este e-mail já é da equipe de outro restaurante.", 409, "other_restaurant");

    await db.runTransaction(async (tx: Db) => {
      if ((await tx.get(restaurantRef)).exists) throw fail("Já existe um restaurante com este identificador. Escolha outro.", 409, "restaurant_exists");
      tx.set(restaurantRef, { restaurantId: body.restaurantId, name: body.restaurantName, slug: body.restaurantId, description: "", address: "", phone: "", logoUrl: null, isActive: true, createdBy: admin.uid, createdAt: now, updatedAt: now });
      tx.set(db.collection("restaurantSettings").doc(), defaultRestaurantSettings(body.restaurantId, now));
      tx.set(staffRef, { uid, name: body.adminName, email: body.adminEmail, role: "admin", restaurantId: body.restaurantId, isActive: true, createdBy: admin.uid, createdAt: now, updatedAt: now });
    });
    return NextResponse.json({ ok: true, restaurantId: body.restaurantId, uid, passwordKept }, { status: 201 });
  } catch (error) {
    const failure = error as { status?: number; code?: string };
    if (failure.status) return NextResponse.json({ error: (error as Error).message, code: failure.code }, { status: failure.status });
    if (failure.code === "auth/invalid-password") return NextResponse.json({ error: "Senha fraca: use pelo menos 8 caracteres." }, { status: 400 });
    if (failure.code === "auth/invalid-email") return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    throw error;
  }
}

export const GET = withApiErrors("platform/restaurants:list", list, "Não foi possível listar os restaurantes.");
export const POST = withApiErrors("platform/restaurants:create", create, "Não foi possível cadastrar o restaurante.");
