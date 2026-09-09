import "server-only";

import crypto from "node:crypto";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

const DEFAULT_WINDOW_SECONDS = 45;
const DEFAULT_MAX_ORDERS = 3;
const DEFAULT_SESSION_DURATION_MINUTES = 90;
const ACCESS_TOKEN_TTL_MINUTES = 180;
export const PUBLIC_ACCESS_COOKIE = "qrapido_table_access";
export const MAX_ACCESS_ATTEMPTS = 5;
const ACCESS_LOCK_MINUTES = 15;

function nowIso(): string {
  return new Date().toISOString();
}

function toMillis(value: string): number {
  return new Date(value).getTime();
}

function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashAttendanceCode(code: string, salt: string): string {
  return crypto.scryptSync(code, salt, 32).toString("hex");
}

export function createAttendanceCode(): { code: string; salt: string; hash: string } {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = crypto.randomBytes(16).toString("hex");
  return { code, salt, hash: hashAttendanceCode(code, salt) };
}

export function createSessionToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function createPublicTableToken(): string {
  return crypto.randomBytes(32).toString("base64url");
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

export async function createSessionAccessGrant(session: any): Promise<{ cookieValue: string; csrfToken: string; expiresAt: string }> {
  const db = getAdminFirestore() as any;
  const grantId = crypto.randomBytes(18).toString("base64url");
  const secret = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MINUTES * 60_000).toISOString();
  await db.collection("sessionAccessGrants").doc(grantId).set(
    {
      sessionId: session.id,
      restaurantId: session.restaurantId,
      tableId: session.tableId,
      tokenHash: hashValue(secret),
      csrfHash: hashValue(csrfToken),
      expiresAt,
      revokedAt: null,
      blockedUntil: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  );

  await db.collection("tableSessions").doc(session.id).set({ lastActivityAt: nowIso(), updatedAt: nowIso() }, { merge: true });

  return { cookieValue: `${grantId}.${secret}`, csrfToken, expiresAt };
}

export async function validateAccessGrant(session: any, cookieValue: string | null, csrfToken?: string | null): Promise<boolean> {
  if (!cookieValue) return false;
  const [grantId, secret, ...extra] = cookieValue.split(".");
  if (!grantId || !secret || extra.length) return false;
  const db = getAdminFirestore() as any;
  const doc = await db.collection("sessionAccessGrants").doc(grantId).get();
  if (!doc.exists) return false;
  const data = doc.data();
  if (!data || data.revokedAt || toMillis(data.expiresAt) <= Date.now()) return false;
  if (data.blockedUntil && toMillis(data.blockedUntil) > Date.now()) return false;
  if (computeSessionStatus(session) !== "active") return false;
  if (data.sessionId !== session.id || data.restaurantId !== session.restaurantId || data.tableId !== session.tableId) return false;
  if (data.tokenHash !== hashValue(secret)) return false;
  const table = await resolveTable(session.tableId);
  if (!table || table.restaurantId !== session.restaurantId || table.status !== "active" || table.isActive === false) return false;
  return csrfToken === undefined || Boolean(csrfToken && data.csrfHash === hashValue(csrfToken));
}

export async function resolveAuthorizedSession(cookieValue: string | null, csrfToken?: string | null): Promise<any | null> {
  if (!cookieValue) return null;
  const grantId = cookieValue.split(".")[0];
  if (!grantId) return null;
  const grant = await (getAdminFirestore() as any).collection("sessionAccessGrants").doc(grantId).get();
  if (!grant.exists) return null;
  const sessionDoc = await (getAdminFirestore() as any).collection("tableSessions").doc(grant.data().sessionId).get();
  if (!sessionDoc.exists) return null;
  const session = { id: sessionDoc.id, ...sessionDoc.data() };
  return await validateAccessGrant(session, cookieValue, csrfToken) ? session : null;
}

export async function verifyAttendanceCode(session: any, code: string): Promise<{ ok: true } | { ok: false; limited: boolean }> {
  const db = getAdminFirestore() as any;
  const ref = db.collection("tableSessions").doc(session.id);
  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, limited: false };
    const fresh = snap.data();
    if (computeSessionStatus(fresh) !== "active") return { ok: false, limited: false };
    const valid = Boolean(fresh.accessCodeHash && fresh.accessCodeSalt) &&
      crypto.timingSafeEqual(Buffer.from(hashAttendanceCode(code, fresh.accessCodeSalt), "hex"), Buffer.from(fresh.accessCodeHash, "hex"));
    if (valid) {
      tx.update(ref, { accessFailedAttempts: 0, accessLockedUntil: null, updatedAt: nowIso() });
      return { ok: true };
    }
    const attempts = (fresh.accessFailedAttempts ?? 0) + 1;
    // The per-IP/table Firestore limiter protects attempts. Never lock the whole
    // table because several legitimate diners commonly share the restaurant Wi-Fi.
    tx.update(ref, { accessFailedAttempts: attempts, accessLockedUntil: null, updatedAt: nowIso() });
    return { ok: false, limited: false };
  });
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
  peopleCount?: number;
  notes?: string | null;
  openedByStaffId?: string | null;
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
    peopleCount: input.peopleCount ?? input.table.currentPeopleCount ?? 1,
    maxOrdersAllowed: input.peopleCount ?? input.table.currentPeopleCount ?? 1,
    completedOrdersCount: 0,
    openedByStaffId: input.openedByStaffId ?? null,
    notes: input.notes ?? null,
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
