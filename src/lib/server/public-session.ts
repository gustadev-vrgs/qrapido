import "server-only";

import crypto from "node:crypto";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

const DEFAULT_WINDOW_SECONDS = 45;
const DEFAULT_MAX_ORDERS = 3;
const DEFAULT_SESSION_DURATION_MINUTES = 90;
const ACCESS_TOKEN_TTL_MINUTES = 180;

function nowIso(): string {
  return new Date().toISOString();
}

function toMillis(value: string): number {
  return new Date(value).getTime();
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createSessionToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function createDuplicateGuardHash(sessionToken: string, fingerprint: string): string {
  return hashValue(`${sessionToken}:${fingerprint}`);
}

export async function resolveSession(sessionToken: string): Promise<any | null> {
  const db = getAdminFirestore() as any;
  const snapshot = await db.collection("tableSessions").where("sessionToken", "==", sessionToken).limit(1).get();
  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function resolveSettings(restaurantId: string): Promise<any | null> {
  const db = getAdminFirestore() as any;
  const snapshot = await db.collection("restaurantSettings").where("restaurantId", "==", restaurantId).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function resolveTable(tableId: string): Promise<any | null> {
  const db = getAdminFirestore() as any;
  const doc = await db.collection("tables").doc(tableId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export function computeSessionStatus(session: any): "active" | "expired" | "blocked" | "closed" {
  if (session.status === "blocked") return "blocked";
  if (session.status === "closed") return "closed";
  if (toMillis(session.expiresAt) <= Date.now()) return "expired";
  return "active";
}

export async function markSessionExpired(sessionId: string): Promise<void> {
  const db = getAdminFirestore() as any;
  await db.collection("tableSessions").doc(sessionId).set({ status: "expired", updatedAt: nowIso() }, { merge: true });
}

export async function createSessionAccessGrant(session: any): Promise<{ accessToken: string; expiresAt: string }> {
  const db = getAdminFirestore() as any;
  const accessToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MINUTES * 60_000).toISOString();
  await db.collection("sessionAccessGrants").doc(session.id).set(
    {
      sessionId: session.id,
      sessionToken: session.sessionToken,
      tokenHash: hashValue(accessToken),
      expiresAt,
      updatedAt: nowIso()
    },
    { merge: true }
  );

  await db.collection("tableSessions").doc(session.id).set({ lastActivityAt: nowIso(), updatedAt: nowIso() }, { merge: true });

  return { accessToken, expiresAt };
}

export async function validateAccessGrant(session: any, accessToken: string | null): Promise<boolean> {
  if (!accessToken) return false;
  const db = getAdminFirestore() as any;
  const doc = await db.collection("sessionAccessGrants").doc(session.id).get();
  if (!doc.exists) return false;
  const data = doc.data();
  if (!data || toMillis(data.expiresAt) <= Date.now()) return false;
  return data.tokenHash === hashValue(accessToken);
}

export async function createOperationalEvent(input: {
  restaurantId: string;
  tableId: string;
  sessionId: string;
  orderId?: string;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getAdminFirestore() as any;
  await db.collection("orderEvents").add({
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    sessionId: input.sessionId,
    orderId: input.orderId ?? "system",
    actorType: "customer",
    actorId: null,
    type: input.type,
    message: input.message,
    metadata: input.metadata ?? {},
    createdAt: nowIso()
  });
}

export async function createSessionForTable(input: {
  restaurantId: string;
  table: any;
  customerName?: string | null;
  deviceFingerprint?: string | null;
}): Promise<{ sessionId: string; sessionToken: string; expiresAt: string }> {
  const db = getAdminFirestore() as any;
  const settings = await resolveSettings(input.restaurantId);
  const sessionDurationMinutes = settings?.defaultSessionDurationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES;
  const expiresAt = new Date(Date.now() + sessionDurationMinutes * 60_000).toISOString();
  const sessionToken = createSessionToken();

  const doc = await db.collection("tableSessions").add({
    restaurantId: input.restaurantId,
    tableId: input.table.id,
    tableNumber: input.table.number,
    sessionToken,
    sessionLabel: `${input.table.label || `Mesa ${input.table.number}`} - ${new Date().toLocaleTimeString("pt-BR")}`,
    customerName: input.customerName ?? null,
    status: "active",
    deviceFingerprint: input.deviceFingerprint ?? null,
    startedAt: nowIso(),
    expiresAt,
    closedAt: null,
    lastActivityAt: nowIso(),
    requestCountWindow: 0,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  return { sessionId: doc.id, sessionToken, expiresAt };
}

export async function guardOrderAbuse(input: {
  restaurantId: string;
  sessionId: string;
  duplicateGuardHash: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getAdminFirestore() as any;
  const settings = await resolveSettings(input.restaurantId);
  const antiSpamWindowSeconds = settings?.antiSpamWindowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const maxOrdersPerWindow = settings?.maxOrdersPerWindow ?? DEFAULT_MAX_ORDERS;

  const windowStart = new Date(Date.now() - antiSpamWindowSeconds * 1000).toISOString();

  const recentOrders = await db
    .collection("orders")
    .where("sessionId", "==", input.sessionId)
    .where("receivedAt", ">=", windowStart)
    .get();

  if (recentOrders.size >= maxOrdersPerWindow) {
    return { ok: false, reason: "Limite de frequência atingido para esta sessão." };
  }

  const duplicate = await db
    .collection("orders")
    .where("sessionId", "==", input.sessionId)
    .where("duplicateGuardHash", "==", input.duplicateGuardHash)
    .limit(1)
    .get();

  if (!duplicate.empty) {
    return { ok: false, reason: "Pedido duplicado detectado." };
  }

  return { ok: true };
}
