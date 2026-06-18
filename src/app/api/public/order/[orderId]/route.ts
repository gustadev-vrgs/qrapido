import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { resolveSession, validateAccessGrant } from "@/lib/server/public-session";

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }): Promise<NextResponse> {
  const sessionToken = request.nextUrl.searchParams.get("sessionToken") ?? "";
  const session = await resolveSession(sessionToken);
  if (!session) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  if (!(await validateAccessGrant(session, request.headers.get("x-session-access-token")))) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const doc = await (getAdminFirestore() as any).collection("orders").doc(params.orderId).get();
  if (!doc.exists) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  const order = { id: doc.id, ...doc.data() };
  if (order.sessionId !== session.id || order.tableId !== session.tableId) return NextResponse.json({ error: "Pedido não pertence a esta mesa." }, { status: 403 });
  return NextResponse.json(order);
}
