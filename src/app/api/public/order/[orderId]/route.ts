import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { PUBLIC_ACCESS_COOKIE, resolveAuthorizedSession } from "@/lib/server/public-session";

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }): Promise<NextResponse> {
  const session = await resolveAuthorizedSession(request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null);
  if (!session) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const doc = await (getAdminFirestore() as any).collection("orders").doc(params.orderId).get();
  if (!doc.exists) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  const d = doc.data();
  if (d.sessionId !== session.id || d.tableId !== session.tableId || d.restaurantId !== session.restaurantId) return NextResponse.json({ error: "Pedido não pertence a esta autorização." }, { status: 403 });
  return NextResponse.json({ id: doc.id, orderCode: d.orderCode, tableNumber: d.tableNumber, items: (d.items ?? []).map((i: any) => ({ menuItemId: i.menuItemId, nameSnapshot: i.nameSnapshot, priceSnapshot: i.priceSnapshot, quantity: i.quantity, notes: i.notes ?? null, total: i.total })), subtotal: d.subtotal, serviceFee: d.serviceFee, total: d.total, paymentMethod: d.paymentMethod, paymentMode: d.paymentMode, paymentStatus: d.paymentStatus, status: d.status, receivedAt: d.receivedAt, createdAt: d.createdAt, updatedAt: d.updatedAt });
}
