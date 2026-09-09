import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, forbiddenResource, requireStaffRequest } from "@/lib/server/admin-auth";
import { payloadTooLargeResponse, readLimitedJson } from "@/lib/server/public-api-security";

const schema = z.object({ grantId: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/), minutes: z.number().int().min(1).max(120).default(15) }).strict();

/** Blocks one browser authorization without disrupting the table or other diners. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  let body: unknown; try { body = await readLimitedJson(request, 1024); } catch { return payloadTooLargeResponse(); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  const db = getAdminFirestore() as any; const ref = db.collection("sessionAccessGrants").doc(parsed.data.grantId); const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Autorização não encontrada." }, { status: 404 });
  if (snap.data().restaurantId !== staff.staffUser.restaurantId) return forbiddenResource(staff.requestId);
  const now = Date.now(); const blockedUntil = new Date(now + parsed.data.minutes * 60_000).toISOString();
  await ref.set({ blockedUntil, blockedByStaffId: staff.uid, updatedAt: new Date(now).toISOString() }, { merge: true });
  return NextResponse.json({ ok: true, blockedUntil });
}
