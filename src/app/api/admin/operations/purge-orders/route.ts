import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { OWNER_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";
import { writeAudit } from "@/lib/server/audit";

type Db = any;

/** Per click: keeps each run far below the free plan's 20k deletes/day and a short request. */
const MAX_DELETES = 450;
const CONFIRM_WORD = "APAGAR";

const bodySchema = z.object({
  /** Last day (restaurant time, YYYY-MM-DD) to delete. null = every closed table. */
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  confirm: z.string(),
  resetReceiptNumbers: z.boolean().optional()
});

/** Closed visits read per call: bounds the reads too (free plan: 50k/day). */
const MAX_SESSIONS = 40;

/**
 * Closed visits of this restaurant up to the cutoff, oldest first, at most MAX_SESSIONS.
 * With a cutoff it uses the (restaurantId, status, closedAt) index from firestore.indexes.json;
 * if that index was not published yet it falls back to reading the closed visits and
 * filtering here, which costs more reads but still works.
 */
async function closedSessions(db: Db, restaurantId: string, cutoff: number): Promise<Db[]> {
  const closed = db.collection("tableSessions").where("restaurantId", "==", restaurantId).where("status", "==", "closed");
  if (!Number.isFinite(cutoff)) return (await closed.limit(MAX_SESSIONS).get()).docs;
  try {
    return (await closed.where("closedAt", "<=", new Date(cutoff).toISOString()).orderBy("closedAt").limit(MAX_SESSIONS).get()).docs;
  } catch (failure) {
    const code = (failure as { code?: unknown }).code;
    if (code !== 9 && code !== "failed-precondition" && !/FAILED_PRECONDITION|requires an index/i.test(String((failure as Error)?.message))) throw failure;
    const all = await closed.get();
    return all.docs
      .filter((doc: Db) => { const at = Date.parse(String(doc.data().closedAt ?? "")); return Number.isFinite(at) && at <= cutoff; })
      .sort((a: Db, b: Db) => String(a.data().closedAt).localeCompare(String(b.data().closedAt)))
      .slice(0, MAX_SESSIONS);
  }
}

/** Collections tied to one table visit (session) that go away with it. */
const SESSION_CHILDREN = ["orders", "orderEvents", "waiterCalls", "adminAlerts", "receipts"] as const;

/**
 * Test-data cleanup: removes everything about tables that are already closed — their
 * orders, order history, waiter calls, alerts and receipts — up to a chosen day.
 * Open tables are never touched (their orders are still being served or paid), and
 * the menu, tables, staff and settings stay. Admin only, with a typed confirmation,
 * and the cleanup itself is written to the audit log.
 */
async function purge(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, OWNER_ROLES);
  if (staff instanceof NextResponse) return staff;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos.", code: "invalid_body" }, { status: 400 });
  if (parsed.data.confirm.trim().toUpperCase() !== CONFIRM_WORD) {
    return NextResponse.json({ error: `Digite ${CONFIRM_WORD} para confirmar.`, code: "confirmation_required" }, { status: 400 });
  }

  const restaurantId = staff.staffUser.restaurantId;
  const db = getAdminFirestore() as Db;
  // End of the chosen day in Brasília time (UTC-3, no daylight saving since 2019).
  const cutoff = parsed.data.until ? Date.parse(`${parsed.data.until}T23:59:59.999-03:00`) : Number.POSITIVE_INFINITY;

  const sessions = await closedSessions(db, restaurantId, cutoff);
  const counts = { tables: 0, orders: 0, other: 0 };
  let deletes = 0;
  let more = false;
  for (const session of sessions) {
    const children = await Promise.all(SESSION_CHILDREN.map((name) => db.collection(name).where("sessionId", "==", session.id).get()));
    const own = children.map((snap: Db) => snap.docs.filter((doc: Db) => doc.data().restaurantId === restaurantId));
    const size = own.reduce((sum: number, docs: Db[]) => sum + docs.length, 1);
    if (deletes > 0 && deletes + size > MAX_DELETES) { more = true; break; }
    await Promise.all(own.flat().map((doc: Db) => doc.ref.delete()));
    await session.ref.delete();
    deletes += size;
    counts.tables += 1;
    counts.orders += own[0].length;
    counts.other += size - 1 - own[0].length;
  }

  if (!more && sessions.length === MAX_SESSIONS) more = true;

  let receiptsRestarted = false;
  if (parsed.data.resetReceiptNumbers && !more) {
    const left = await db.collection("receipts").where("restaurantId", "==", restaurantId).limit(1).get();
    if (left.empty) {
      await db.collection("restaurants").doc(restaurantId).set({ receiptSeq: 0, updatedAt: new Date().toISOString() }, { merge: true });
      receiptsRestarted = true;
    }
  }

  if (counts.tables > 0 || receiptsRestarted) {
    await writeAudit(db, {
      restaurantId, actorId: staff.staffUser.id, actorName: staff.staffUser.name, type: "orders_purged",
      message: `Apagou ${counts.orders} pedido(s) de ${counts.tables} mesa(s) já fechada(s)${parsed.data.until ? ` até ${parsed.data.until.split("-").reverse().join("/")}` : ""}${receiptsRestarted ? " e recomeçou a numeração dos recibos" : ""}.`,
      metadata: { until: parsed.data.until, ...counts, receiptsRestarted, more }
    });
  }

  return NextResponse.json({ ok: true, ...counts, receiptsRestarted, more, requestId: staff.requestId }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiErrors("admin/operations/purge-orders", purge, "Não foi possível apagar os pedidos.");

export const dynamic = "force-dynamic";
