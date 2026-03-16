import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  computeSessionStatus,
  createOperationalEvent,
  guardOrderAbuse,
  markSessionExpired,
  resolveSession,
  resolveTable,
  validateAccessGrant
} from "@/lib/server/public-session";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

const itemSchema = z.object({
  menuItemId: z.string().min(1),
  nameSnapshot: z.string().min(1),
  priceSnapshot: z.number().positive(),
  quantity: z.number().int().positive(),
  notes: z.string().max(280).nullable(),
  total: z.number().positive()
});

const payloadSchema = z.object({
  sessionToken: z.string().min(16).max(128),
  items: z.array(itemSchema).min(1),
  subtotal: z.number().positive(),
  duplicateFingerprint: z.string().min(8).max(280),
  notes: z.string().max(500).nullable().optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const session = await resolveSession(parsed.data.sessionToken);
  if (!session) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  }

  const accessToken = request.headers.get("x-session-access-token");
  if (!(await validateAccessGrant(session, accessToken))) {
    return NextResponse.json({ error: "Acesso não autorizado para essa sessão." }, { status: 401 });
  }

  const table = await resolveTable(session.tableId);
  if (!table || table.status !== "active") {
    await createOperationalEvent({
      restaurantId: session.restaurantId,
      tableId: session.tableId,
      sessionId: session.id,
      type: "order_cancelled",
      message: "Tentativa de pedido com mesa inativa",
      metadata: { reason: "inactive_table" }
    });
    return NextResponse.json({ error: "Mesa não está ativa para pedidos." }, { status: 409 });
  }

  const status = computeSessionStatus(session);
  if (status === "expired") {
    await markSessionExpired(session.id);
    return NextResponse.json({ error: "Sessão expirada." }, { status: 410 });
  }

  if (status !== "active") {
    return NextResponse.json({ error: "Sessão indisponível." }, { status: 403 });
  }

  const duplicateGuardHash = crypto
    .createHash("sha256")
    .update(`${parsed.data.sessionToken}:${parsed.data.duplicateFingerprint}:${Math.round(parsed.data.subtotal * 100)}`)
    .digest("hex");

  const abuseCheck = await guardOrderAbuse({
    restaurantId: session.restaurantId,
    sessionId: session.id,
    duplicateGuardHash
  });

  if (!abuseCheck.ok) {
    await createOperationalEvent({
      restaurantId: session.restaurantId,
      tableId: session.tableId,
      sessionId: session.id,
      type: "order_cancelled",
      message: "Pedido bloqueado por anti-abuso",
      metadata: { reason: abuseCheck.reason }
    });
    return NextResponse.json({ error: abuseCheck.reason }, { status: 429 });
  }

  const db = getAdminFirestore() as any;
  const receivedAt = new Date().toISOString();
  const orderPayload = {
    restaurantId: session.restaurantId,
    tableId: session.tableId,
    tableNumber: session.tableNumber,
    sessionId: session.id,
    sessionToken: session.sessionToken,
    customerName: session.customerName ?? null,
    items: parsed.data.items,
    subtotal: Number(parsed.data.subtotal.toFixed(2)),
    serviceFee: 0,
    total: Number(parsed.data.subtotal.toFixed(2)),
    paymentMethod: "card_on_table",
    status: "received",
    notes: parsed.data.notes ?? null,
    duplicateGuardHash,
    receivedAt,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: receivedAt,
    updatedAt: receivedAt
  };

  const orderRef = await db.collection("orders").add(orderPayload);

  await createOperationalEvent({
    restaurantId: session.restaurantId,
    tableId: session.tableId,
    sessionId: session.id,
    orderId: orderRef.id,
    type: "order_created",
    message: "Pedido criado pelo cliente",
    metadata: {
      itemsCount: parsed.data.items.length,
      subtotal: parsed.data.subtotal
    }
  });

  await db.collection("tableSessions").doc(session.id).set({ lastActivityAt: receivedAt, updatedAt: receivedAt }, { merge: true });

  return NextResponse.json({ orderId: orderRef.id }, { status: 201 });
}
