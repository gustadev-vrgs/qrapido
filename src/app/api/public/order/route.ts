import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { computeSessionStatus, createOperationalEvent, guardOrderAbuse, markSessionExpired, PUBLIC_ACCESS_COOKIE, resolveAuthorizedSession, resolveTable } from "@/lib/server/public-session";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

const itemSchema = z.object({ menuItemId: z.string().min(1), quantity: z.number().int().positive().max(99), notes: z.string().max(280).nullable().optional() });
const payloadSchema = z.object({
  items: z.array(itemSchema).min(1),
  duplicateFingerprint: z.string().min(8).max(280),
  customerName: z.string().max(80).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  paymentMethod: z.enum(["pix", "cash", "debit_card", "credit_card"]),
  paymentMode: z.enum(["system_simulated", "counter", "waiter"]),
  changeFor: z.number().positive().nullable().optional()
});

function roundMoney(value: number): number { return Math.round(value * 100) / 100; }
function paymentStatus(method: string, mode: string): string {
  if (mode === "counter") return "pagar no caixa";
  if (mode === "waiter") return "aguardando garçom";
  if (method === "pix" || method === "credit_card" || method === "debit_card") return "simulado";
  return "pendente";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const session = await resolveAuthorizedSession(request.cookies.get(PUBLIC_ACCESS_COOKIE)?.value ?? null, request.headers.get("x-csrf-token"));
  if (!session) return NextResponse.json({ error: "Acesso não autorizado para essa mesa." }, { status: 401 });

  const table = await resolveTable(session.tableId);
  if (!table || table.status !== "active") return NextResponse.json({ error: "Mesa não está ativa para pedidos." }, { status: 409 });

  const status = computeSessionStatus(session);
  if (status === "expired") { await markSessionExpired(session.id); return NextResponse.json({ error: "Sessão expirada." }, { status: 410 }); }
  if (status !== "active") return NextResponse.json({ error: "Sessão indisponível." }, { status: 403 });

  const db = getAdminFirestore() as any;
  const duplicateGuardHash = crypto.createHash("sha256").update(`${session.id}:${parsed.data.duplicateFingerprint}`).digest("hex");
  const abuseCheck = await guardOrderAbuse({ restaurantId: session.restaurantId, sessionId: session.id, duplicateGuardHash });
  if (!abuseCheck.ok) return NextResponse.json({ error: abuseCheck.reason }, { status: 429 });

  const menuRefs = parsed.data.items.map((item) => db.collection("menuItems").doc(item.menuItemId));
  const menuDocs = await db.getAll(...menuRefs);
  const menuById = new Map<string, any>();
  for (const doc of menuDocs) {
    if (!doc.exists) return NextResponse.json({ error: "Um item do pedido não existe mais." }, { status: 400 });
    const item = { id: doc.id, ...doc.data() };
    if (item.restaurantId !== session.restaurantId || item.isActive !== true || item.isAvailable !== true) return NextResponse.json({ error: `O item ${item.name ?? doc.id} não está disponível.` }, { status: 409 });
    menuById.set(doc.id, item);
  }

  const items = parsed.data.items.map((input) => {
    const menuItem = menuById.get(input.menuItemId);
    const total = roundMoney(menuItem.price * input.quantity);
    return { menuItemId: input.menuItemId, nameSnapshot: menuItem.name, priceSnapshot: roundMoney(menuItem.price), quantity: input.quantity, notes: input.notes?.trim() || null, total };
  });
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const now = new Date().toISOString();

  try {
    const result = await db.runTransaction(async (transaction: any) => {
      const sessionRef = db.collection("tableSessions").doc(session.id);
      const sessionSnap = await transaction.get(sessionRef);
      if (!sessionSnap.exists) throw new Error("SESSION_NOT_FOUND");
      const fresh = sessionSnap.data();
      if (fresh.status !== "active" || new Date(fresh.expiresAt).getTime() <= Date.now()) throw new Error("SESSION_INACTIVE");
      if ((fresh.completedOrdersCount ?? 0) >= (fresh.maxOrdersAllowed ?? fresh.peopleCount ?? 1)) throw new Error("ORDER_LIMIT");
      const sequence = (fresh.completedOrdersCount ?? 0) + 1;
      const orderRef = db.collection("orders").doc();
      const code = `M${fresh.tableNumber}-${String(sequence).padStart(2, "0")}-${orderRef.id.slice(-4).toUpperCase()}`;
      transaction.set(orderRef, {
        restaurantId: session.restaurantId, orderCode: code, tableId: session.tableId, tableNumber: session.tableNumber,
        sessionId: session.id, sessionToken: session.sessionToken, customerName: parsed.data.customerName?.trim() || session.customerName || null,
        items, subtotal, serviceFee: 0, total: subtotal, paymentMethod: parsed.data.paymentMethod, paymentMode: parsed.data.paymentMode,
        paymentStatus: paymentStatus(parsed.data.paymentMethod, parsed.data.paymentMode), changeFor: parsed.data.changeFor ?? null,
        status: "received", notes: parsed.data.notes?.trim() || null, duplicateGuardHash, receivedAt: now, deliveredAt: null, cancelledAt: null,
        cancelReason: null, orderSlotReleased: false, createdAt: now, updatedAt: now
      });
      transaction.update(sessionRef, { completedOrdersCount: sequence, lastActivityAt: now, updatedAt: now });
      return { orderId: orderRef.id, orderCode: code };
    });

    await Promise.all([
      createOperationalEvent({ restaurantId: session.restaurantId, tableId: session.tableId, sessionId: session.id, orderId: result.orderId, type: "order_created", message: "Pedido criado pelo cliente", metadata: { subtotal } }),
      db.collection("adminAlerts").add({ restaurantId: session.restaurantId, type: "new_order", title: "Novo pedido", message: `Mesa ${session.tableNumber} criou o pedido ${result.orderCode}.`, targetType: "order", targetId: result.orderId, read: false, createdAt: now })
    ]);
    return NextResponse.json({ orderId: result.orderId, orderCode: result.orderCode, subtotal }, { status: 201 });
  } catch (error: any) {
    if (error.message === "ORDER_LIMIT") return NextResponse.json({ error: "Todos os pedidos permitidos para esta mesa já foram utilizados. Solicite ajuda a um funcionário." }, { status: 409 });
    if (error.message === "SESSION_INACTIVE") return NextResponse.json({ error: "Sessão indisponível." }, { status: 403 });
    throw error;
  }
}
