import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { computeSessionStatus, markSessionExpired, PUBLIC_ACCESS_COOKIE, validateAccessGrant } from "@/lib/server/public-session";

const TOKEN_PATTERN = /^[a-zA-Z0-9_-]{24,128}$/;
const category = (doc: any) => { const d = doc.data(); return { id: doc.id, name: d.name, description: d.description ?? "", sortOrder: d.sortOrder ?? 0, isActive: true }; };
const item = (doc: any) => { const d = doc.data(); return { id: doc.id, categoryId: d.categoryId, name: d.name, description: d.description ?? "", price: d.price, imageUrl: d.imageUrl ?? null, preparationTimeMinutes: d.preparationTimeMinutes ?? 0, isActive: true, isAvailable: true, isFeatured: d.isFeatured === true, sortOrder: d.sortOrder ?? 0 }; };

export async function GET(request: NextRequest, { params }: { params: { token: string } }): Promise<NextResponse> {
  const token = decodeURIComponent(params.token ?? "").trim();
  if (!TOKEN_PATTERN.test(token)) return NextResponse.json({ error: "QR Code inválido ou mesa não encontrada." }, { status: 404 });
  const db = getAdminFirestore() as any;
  const tables = await db.collection("tables").where("publicToken", "==", token).limit(1).get();
  if (tables.empty) return NextResponse.json({ error: "QR Code inválido ou mesa não encontrada." }, { status: 404 });
  const tableDoc = tables.docs[0]; const table = { id: tableDoc.id, ...tableDoc.data() } as any;
  if (table.isActive === false || table.status === "blocked") return NextResponse.json({ error: "Esta mesa está temporariamente indisponível." }, { status: 423 });
  const sessions = await db.collection("tableSessions").where("tableId", "==", table.id).where("status", "==", "active").limit(1).get();
  if (sessions.empty) return NextResponse.json({ error: "Solicite a liberação da mesa a um funcionário.", requiresAccessCode: true, table: { number: table.number, label: table.label } }, { status: 409 });
  const sessionDoc = sessions.docs[0]; const session = { id: sessionDoc.id, ...sessionDoc.data() } as any;
  if (computeSessionStatus(session) !== "active") { if (computeSessionStatus(session) === "expired") await markSessionExpired(session.id); return NextResponse.json({ error: "Atendimento indisponível. Solicite a liberação à equipe." }, { status: 409 }); }
  const authorized = await validateAccessGrant(session, request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null);
  if (!authorized) return NextResponse.json({ requiresAccessCode: true, table: { number: table.number, label: table.label }, message: "Peça à equipe o código temporário deste atendimento." }, { status: 401 });
  const [restaurant, categories, items, settings] = await Promise.all([db.collection("restaurants").doc(table.restaurantId).get(), db.collection("menuCategories").where("restaurantId", "==", table.restaurantId).where("isActive", "==", true).orderBy("sortOrder", "asc").get(), db.collection("menuItems").where("restaurantId", "==", table.restaurantId).where("isActive", "==", true).where("isAvailable", "==", true).orderBy("sortOrder", "asc").get(), db.collection("restaurantSettings").where("restaurantId", "==", table.restaurantId).limit(1).get()]);
  const s = settings.empty ? null : settings.docs[0].data();
  const response = NextResponse.json({ restaurantName: restaurant.exists ? restaurant.data()?.name ?? null : null, table: { number: table.number, label: table.label }, session: { id: session.id, tableNumber: session.tableNumber, peopleCount: session.peopleCount, maxOrdersAllowed: session.maxOrdersAllowed, completedOrdersCount: session.completedOrdersCount, startedAt: session.startedAt }, categories: categories.docs.map(category), items: items.docs.map(item), settings: s ? { allowCustomerNotes: s.allowCustomerNotes ?? true, allowWaiterCall: s.allowWaiterCall ?? true, serviceFeePercent: s.serviceFeePercent ?? 0 } : null });
  response.headers.set("Cache-Control", "private, no-store"); return response;
}
