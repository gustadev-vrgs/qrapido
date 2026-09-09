import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { ADMIN_ROLES, requireStaffRequest } from "@/lib/server/admin-auth";

// Read-only diagnosis: it never deletes or repairs production records automatically.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const staff = await requireStaffRequest(request, ADMIN_ROLES);
  if (staff instanceof NextResponse) return staff;
  const db = getAdminFirestore() as any;
  const [tables, sessions] = await Promise.all([
    db.collection("tables").where("restaurantId", "==", staff.staffUser.restaurantId).get(),
    db.collection("tableSessions").where("restaurantId", "==", staff.staffUser.restaurantId).get()
  ]);
  const sessionMap = new Map(sessions.docs.map((doc: any) => [doc.id, doc.data()]));
  const issues: Array<Record<string, unknown>> = [];
  for (const doc of tables.docs) {
    const table = doc.data(); const session = table.currentSessionGroupId ? sessionMap.get(table.currentSessionGroupId) : null;
    if (table.status === "active" && !session) issues.push({ code: "ACTIVE_WITHOUT_SESSION", tableId: doc.id, recovery: "Revisar histórico e vincular ou bloquear manualmente; não criar sessão retroativa." });
    if (session && ["closed"].includes(session.status) && table.status !== "free") issues.push({ code: "CLOSED_SESSION_OCCUPIES_TABLE", tableId: doc.id, sessionId: table.currentSessionGroupId, recovery: "Confirmar ausência de pendências antes de liberar a mesa." });
    if (session && new Date(session.expiresAt).getTime() <= Date.now() && session.status === "active") issues.push({ code: "EXPIRED_NOT_MATERIALIZED", tableId: doc.id, sessionId: table.currentSessionGroupId, recovery: "Renovar ou bloquear novos pedidos; preservar pedidos existentes." });
  }
  return NextResponse.json({ generatedAt: new Date().toISOString(), readOnly: true, issueCount: issues.length, issues });
}
