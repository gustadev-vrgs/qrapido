import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { withApiErrors } from "@/lib/server/api-errors";
import { toPublicOrder } from "@/lib/server/public-orders";
import { PUBLIC_ACCESS_COOKIE, resolveHistoricalAuthorizedSession } from "@/lib/server/public-session";

async function handler(request: NextRequest, context: { params: Promise<{ orderId: string }> }): Promise<NextResponse> {
  const params = await context.params;
  const session = await resolveHistoricalAuthorizedSession(request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null);
  if (!session) return NextResponse.json({ error: "Este celular não tem acesso a este pedido.", code: "needs_code" }, { status: 401 });
  const orderId = String(params.orderId ?? "").slice(0, 128);
  if (!orderId || orderId.includes("/")) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  const doc = await (getAdminFirestore() as any).collection("orders").doc(orderId).get();
  if (!doc.exists) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  const d = doc.data();
  if (d.sessionId !== session.id || d.tableId !== session.tableId || d.restaurantId !== session.restaurantId) return NextResponse.json({ error: "Este pedido é de outro atendimento." }, { status: 403 });
  return NextResponse.json(toPublicOrder(doc.id, d), { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withApiErrors("public/order/[orderId]", handler, "Não foi possível consultar o pedido agora.");

export const dynamic = "force-dynamic";
