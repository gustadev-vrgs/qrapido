import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{24,128}$/;

function serializeDoc(doc: any): Record<string, unknown> {
  return { id: doc.id, ...doc.data() };
}

export async function GET(_request: NextRequest, { params }: { params: { token: string } }): Promise<NextResponse> {
  const token = decodeURIComponent(params.token ?? "").trim();
  if (!TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "QR Code inválido ou mesa não encontrada.", reason: "invalid_token" }, { status: 404 });
  }

  const db = getAdminFirestore() as any;
  const tableSnapshot = await db.collection("tables").where("publicToken", "==", token).limit(1).get();
  if (tableSnapshot.empty) {
    return NextResponse.json({ error: "QR Code inválido ou mesa não encontrada.", reason: "not_found" }, { status: 404 });
  }

  const tableDoc = tableSnapshot.docs[0];
  const table = { id: tableDoc.id, ...tableDoc.data() } as any;
  if (table.isActive === false || table.status === "blocked") {
    return NextResponse.json({ error: "Esta mesa está temporariamente indisponível.", reason: "inactive_table" }, { status: 423 });
  }

  const sessionsSnapshot = await db.collection("tableSessions").where("tableId", "==", table.id).where("status", "==", "active").limit(1).get();

  if (sessionsSnapshot.empty) {
    return NextResponse.json(
      { error: "Esta mesa ainda não possui um atendimento aberto. Solicite a liberação a um funcionário.", reason: "no_open_session", table: { id: table.id, number: table.number, label: table.label } },
      { status: 409 }
    );
  }

  const sessionDoc = sessionsSnapshot.docs[0];
  const session = { id: sessionDoc.id, ...sessionDoc.data() } as any;
  const [restaurantDoc, categoriesSnapshot, itemsSnapshot] = await Promise.all([
    db.collection("restaurants").doc(table.restaurantId).get(),
    db.collection("menuCategories").where("restaurantId", "==", table.restaurantId).where("isActive", "==", true).orderBy("sortOrder", "asc").get(),
    db.collection("menuItems").where("restaurantId", "==", table.restaurantId).where("isActive", "==", true).where("isAvailable", "==", true).orderBy("sortOrder", "asc").get()
  ]);

  return NextResponse.json({
    restaurantName: restaurantDoc.exists ? restaurantDoc.data()?.name ?? null : null,
    table: { id: table.id, number: table.number, label: table.label, status: table.status, isActive: table.isActive !== false, capacity: table.capacity },
    session,
    categories: categoriesSnapshot.docs.map(serializeDoc),
    items: itemsSnapshot.docs.map(serializeDoc)
  });
}
