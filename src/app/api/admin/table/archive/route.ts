import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, logAdminFailure, requireStaffRequest } from "@/lib/server/admin-auth";
import { classifyServerError } from "@/lib/server/api-errors";

const schema = z.object({ tableId: z.string().min(1).max(128), archived: z.boolean() }).strict();
type Db = any;

/**
 * "Excluir mesa": the table leaves the floor and its QR stops working, but the
 * document stays so the order history and reports keep pointing to it.
 * Restoring brings it back as a free table with the same QR.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const db = getAdminFirestore() as Db;
  const ref = db.collection("tables").doc(parsed.data.tableId);
  try {
    await db.runTransaction(async (tx: Db) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().restaurantId !== staff.staffUser.restaurantId) throw Object.assign(new Error("Mesa não encontrada."), { status: 404 });
      const table = snap.data();
      if (parsed.data.archived && (table.currentSessionGroupId || table.status === "active")) {
        throw Object.assign(new Error("Encerre o atendimento desta mesa antes de excluí-la."), { status: 409 });
      }
      const now = new Date().toISOString();
      tx.update(ref, parsed.data.archived
        ? { archivedAt: now, isActive: false, status: "free", currentSessionGroupId: null, updatedAt: now }
        : { archivedAt: null, isActive: true, status: "free", updatedAt: now });
      tx.set(db.collection("orderEvents").doc(), { restaurantId: staff.staffUser.restaurantId, tableId: snap.id, sessionId: "none", orderId: "system", type: parsed.data.archived ? "table_archived" : "table_restored", actorType: "staff", actorId: staff.staffUser.id, message: parsed.data.archived ? "Mesa excluída (arquivada com histórico)" : "Mesa restaurada", metadata: {}, createdAt: now });
    });
    return NextResponse.json({ ok: true, requestId: staff.requestId });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    if (status !== 500) return NextResponse.json({ error: (error as Error).message, requestId: staff.requestId }, { status });
    logAdminFailure(staff.requestId, "archive_table", error);
    const failure = classifyServerError(error);
    return NextResponse.json({ error: "Não foi possível alterar a mesa.", code: failure.code, hint: failure.hint, requestId: staff.requestId }, { status: failure.status });
  }
}
