import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { computeSessionStatus, createSessionAccessGrant, markSessionExpired } from "@/lib/server/public-session";

const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{24,128}$/;
const PUBLIC_LOAD_ERROR = "Não foi possível carregar os dados da mesa. Tente novamente ou solicite ajuda a um funcionário.";

function mapCategory(doc: any): Record<string, unknown> {
  const data = doc.data();
  return {
    id: doc.id,
    restaurantId: data.restaurantId,
    name: data.name,
    slug: data.slug,
    description: data.description ?? "",
    sortOrder: data.sortOrder ?? 0,
    isActive: data.isActive === true,
    createdAt: data.createdAt ?? "",
    updatedAt: data.updatedAt ?? ""
  };
}

function mapItem(doc: any): Record<string, unknown> {
  const data = doc.data();
  return {
    id: doc.id,
    restaurantId: data.restaurantId,
    categoryId: data.categoryId,
    name: data.name,
    slug: data.slug,
    description: data.description ?? "",
    price: data.price,
    imageUrl: data.imageUrl ?? null,
    preparationTimeMinutes: data.preparationTimeMinutes ?? 0,
    isActive: data.isActive === true,
    isAvailable: data.isAvailable === true,
    isFeatured: data.isFeatured === true,
    sortOrder: data.sortOrder ?? 0,
    createdAt: data.createdAt ?? "",
    updatedAt: data.updatedAt ?? ""
  };
}

function mapPublicSettings(settings: any): Record<string, unknown> | null {
  if (!settings) return null;
  return {
    restaurantId: settings.restaurantId,
    serviceFeePercent: settings.serviceFeePercent ?? 0,
    allowCustomerNotes: settings.allowCustomerNotes ?? true,
    allowWaiterCall: settings.allowWaiterCall ?? true,
    pixKey: settings.pixKey ?? null,
    pixReceiverName: settings.pixReceiverName ?? null
  };
}

export async function GET(_request: NextRequest, { params }: { params: { token: string } }): Promise<NextResponse> {
  try {
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
    const sessionStatus = computeSessionStatus(session);
    if (sessionStatus === "expired") await markSessionExpired(session.id);
    if (sessionStatus !== "active") {
      return NextResponse.json(
        { error: "Esta mesa ainda não possui um atendimento aberto. Solicite a liberação a um funcionário.", reason: "no_open_session", table: { id: table.id, number: table.number, label: table.label } },
        { status: 409 }
      );
    }

    const [restaurantDoc, categoriesSnapshot, itemsSnapshot, settingsSnapshot] = await Promise.all([
      db.collection("restaurants").doc(table.restaurantId).get(),
      db.collection("menuCategories").where("restaurantId", "==", table.restaurantId).where("isActive", "==", true).orderBy("sortOrder", "asc").get(),
      db.collection("menuItems").where("restaurantId", "==", table.restaurantId).where("isActive", "==", true).where("isAvailable", "==", true).orderBy("sortOrder", "asc").get(),
      db.collection("restaurantSettings").where("restaurantId", "==", table.restaurantId).limit(1).get()
    ]);

    const access = await createSessionAccessGrant(session);
    const settings = settingsSnapshot.empty ? null : settingsSnapshot.docs[0].data();

    return NextResponse.json({
      restaurantName: restaurantDoc.exists ? restaurantDoc.data()?.name ?? null : null,
      table: { id: table.id, number: table.number, label: table.label, status: table.status, isActive: table.isActive !== false, capacity: table.capacity },
      session: {
        id: session.id,
        tableId: session.tableId,
        tableNumber: session.tableNumber,
        sessionToken: session.sessionToken,
        status: session.status,
        peopleCount: session.peopleCount,
        maxOrdersAllowed: session.maxOrdersAllowed,
        completedOrdersCount: session.completedOrdersCount,
        startedAt: session.startedAt
      },
      categories: categoriesSnapshot.docs.map(mapCategory),
      items: itemsSnapshot.docs.map(mapItem),
      accessToken: access.accessToken,
      settings: mapPublicSettings(settings)
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error(error);
    return NextResponse.json({ error: PUBLIC_LOAD_ERROR, reason: "load_failed" }, { status: 503 });
  }
}
