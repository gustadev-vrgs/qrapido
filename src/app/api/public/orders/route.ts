import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { withApiErrors } from "@/lib/server/api-errors";
import { toPublicOrder } from "@/lib/server/public-orders";
import { PUBLIC_ACCESS_COOKIE, resolveHistoricalAuthorizedSession } from "@/lib/server/public-session";

/** Orders of the attendance this phone was authorized for (the whole table), newest first. */
async function handler(request: NextRequest): Promise<NextResponse> {
  const session = await resolveHistoricalAuthorizedSession(request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null);
  if (!session) return NextResponse.json({ orders: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const snapshot = await (getAdminFirestore() as any).collection("orders").where("sessionId", "==", session.id).get();
  const orders = snapshot.docs
    .filter((doc: any) => doc.data().restaurantId === session.restaurantId && doc.data().tableId === session.tableId)
    .map((doc: any) => toPublicOrder(doc.id, doc.data()))
    .sort((a: { receivedAt: string }, b: { receivedAt: string }) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return NextResponse.json({ orders, sessionStatus: session.status }, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withApiErrors("public/orders", handler, "Não foi possível listar os pedidos agora.");

export const dynamic = "force-dynamic";
