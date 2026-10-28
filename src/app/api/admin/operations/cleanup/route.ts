import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";
import { withApiErrors } from "@/lib/server/api-errors";

type Db = any;

/** Per click and per collection: keeps each run well inside the free daily quota. */
const MAX_PER_COLLECTION = 300;
const HOUR = 3600_000;

/**
 * Deletes temporary security records nobody can use anymore. Firestore's automatic
 * TTL needs the paid plan, so this runs on demand (Diagnóstico → Limpar). Only records
 * already expired are touched: rate-limit windows, phone access grants (kept a week
 * after expiring so diners can still see their orders) and order idempotency keys.
 * Uses single-field range queries on ISO dates: no composite index needed.
 */
async function cleanup(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const db = getAdminFirestore() as Db;
  const now = Date.now();
  const targets: Array<{ collection: string; field: string; before: string; label: string }> = [
    { collection: "publicRateLimits", field: "resetAt", before: new Date(now - HOUR).toISOString(), label: "limites de tentativas" },
    { collection: "sessionAccessGrants", field: "expiresAt", before: new Date(now - 7 * 24 * HOUR).toISOString(), label: "acessos de celulares" },
    { collection: "orderIdempotency", field: "expiresAt", before: new Date(now - HOUR).toISOString(), label: "registros contra pedido duplicado" }
  ];

  const removed: Array<{ label: string; count: number; more: boolean }> = [];
  for (const target of targets) {
    const snapshot = await db.collection(target.collection).where(target.field, "<", target.before).limit(MAX_PER_COLLECTION).get();
    await Promise.all(snapshot.docs.map((doc: Db) => doc.ref.delete()));
    removed.push({ label: target.label, count: snapshot.size, more: snapshot.size === MAX_PER_COLLECTION });
  }
  const total = removed.reduce((sum, item) => sum + item.count, 0);
  return NextResponse.json({ ok: true, total, removed, more: removed.some((item) => item.more), requestId: staff.requestId }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiErrors("admin/operations/cleanup", cleanup, "Não foi possível limpar os dados temporários.");

export const dynamic = "force-dynamic";
