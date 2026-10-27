import "server-only";

import crypto from "node:crypto";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

/** Firestore Admin handles are typed loosely on purpose: the SDK is loaded lazily. */
type Db = any;
type Doc = Record<string, any>;

const ACCESS_TOKEN_TTL_MINUTES = 360;
export const DEFAULT_SESSION_DURATION_MINUTES = 240;
export const PUBLIC_ACCESS_COOKIE = "qrapido_table_access";

function db(): Db {
  return getAdminFirestore() as Db;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toMillis(value: unknown): number {
  const time = new Date(String(value)).getTime();
  return Number.isNaN(time) ? 0 : time;
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

export async function resolveSettings(restaurantId: string): Promise<Doc | null> {
  const snapshot = await db().collection("restaurantSettings").where("restaurantId", "==", restaurantId).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function resolveTable(tableId: string): Promise<Doc | null> {
  const doc = await db().collection("tables").doc(tableId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

export async function resolveTableByPublicToken(publicToken: string): Promise<Doc | null> {
  const tables = await db().collection("tables").where("publicToken", "==", publicToken).limit(1).get();
  if (tables.empty) return null;
  return { id: tables.docs[0].id, ...tables.docs[0].data() };
}

/** Equality-only query: works without composite indexes. */
export async function findLiveSessionForTable(table: Doc): Promise<Doc | null> {
  if (table.currentSessionGroupId) {
    const current = await db().collection("tableSessions").doc(table.currentSessionGroupId).get();
    if (current.exists && current.data().status === "active") return { id: current.id, ...current.data() };
  }
  const sessions = await db().collection("tableSessions").where("tableId", "==", table.id).where("status", "==", "active").get();
  if (sessions.empty) return null;
  const docs = sessions.docs.map((doc: Doc) => ({ id: doc.id, ...doc.data() }));
  return docs.sort((a: Doc, b: Doc) => toMillis(b.startedAt) - toMillis(a.startedAt))[0];
}

export function computeSessionStatus(session: Doc): "active" | "expired" | "blocked" | "closed" {
  if (session.status === "blocked") return "blocked";
  if (session.status === "closed") return "closed";
  if (session.status === "expired") return "expired";
  if (toMillis(session.expiresAt) <= Date.now()) return "expired";
  return "active";
}

/**
 * Marks the attendance as expired so no new orders or devices are accepted.
 * The table stays occupied (status "active") so the team can renew or close it
 * from the panel; it is no longer moved to "blocked", which looked like a
 * disabled table and could not be reopened.
 */
export async function markSessionExpired(sessionId: string): Promise<void> {
  const firestore = db();
  const sessionRef = firestore.collection("tableSessions").doc(sessionId);
  await firestore.runTransaction(async (tx: Db) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists || ["closed", "blocked", "expired"].includes(sessionSnap.data().status)) return;
    const session = sessionSnap.data();
    const at = nowIso();
    tx.update(sessionRef, { status: "expired", expiredAt: at, updatedAt: at });
    tx.set(firestore.collection("orderEvents").doc(), { restaurantId: session.restaurantId, tableId: session.tableId, sessionId, orderId: "system", type: "session_expired", actorType: "system", actorId: null, message: "Atendimento expirado; novos pedidos foram pausados", metadata: {}, createdAt: at });
  });
}

export async function createSessionAccessGrant(session: Doc): Promise<{ cookieValue: string; csrfToken: string; expiresAt: string }> {
  const firestore = db();
  const grantId = crypto.randomBytes(18).toString("base64url");
  const secret = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const sessionEnd = toMillis(session.expiresAt);
  const ttlEnd = Date.now() + ACCESS_TOKEN_TTL_MINUTES * 60_000;
  // Keep the cookie a little longer than the attendance so a renewal does not log customers out.
  const expiresAt = new Date(Math.max(ttlEnd, sessionEnd + 60 * 60_000)).toISOString();
  await firestore.collection("sessionAccessGrants").doc(grantId).set({
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
  });
  await firestore.collection("tableSessions").doc(session.id).set({ lastActivityAt: nowIso(), updatedAt: nowIso() }, { merge: true });
  return { cookieValue: `${grantId}.${secret}`, csrfToken, expiresAt };
}

function splitCookie(cookieValue: string | null): { grantId: string; secret: string } | null {
  if (!cookieValue) return null;
  const [grantId, secret, ...extra] = cookieValue.split(".");
  if (!grantId || !secret || extra.length) return null;
  return { grantId, secret };
}

/**
 * Validates the browser authorization. Pass `csrfToken` (even an empty string)
 * for state-changing requests; leave it undefined for reads.
 */
export async function validateAccessGrant(session: Doc, cookieValue: string | null, csrfToken?: string | null): Promise<boolean> {
  const parts = splitCookie(cookieValue);
  if (!parts) return false;
  const doc = await db().collection("sessionAccessGrants").doc(parts.grantId).get();
  if (!doc.exists) return false;
  const data = doc.data();
  if (!data || data.revokedAt || toMillis(data.expiresAt) <= Date.now()) return false;
  if (data.blockedUntil && toMillis(data.blockedUntil) > Date.now()) return false;
  if (computeSessionStatus(session) !== "active") return false;
  if (data.sessionId !== session.id || data.restaurantId !== session.restaurantId || data.tableId !== session.tableId) return false;
  if (data.tokenHash !== hashValue(parts.secret)) return false;
  const table = await resolveTable(session.tableId);
  if (!table || table.restaurantId !== session.restaurantId || table.status !== "active" || table.isActive === false) return false;
  return csrfToken === undefined || Boolean(csrfToken && data.csrfHash === hashValue(csrfToken));
}

export async function resolveAuthorizedSession(cookieValue: string | null, csrfToken?: string | null): Promise<Doc | null> {
  const parts = splitCookie(cookieValue);
  if (!parts) return null;
  const grant = await db().collection("sessionAccessGrants").doc(parts.grantId).get();
  if (!grant.exists) return null;
  const sessionDoc = await db().collection("tableSessions").doc(grant.data().sessionId).get();
  if (!sessionDoc.exists) return null;
  const session = { id: sessionDoc.id, ...sessionDoc.data() };
  return (await validateAccessGrant(session, cookieValue, csrfToken)) ? session : null;
}

/** Read-only access for orders already created; expiration or closing does not hide them from the device that ordered. */
export async function resolveHistoricalAuthorizedSession(cookieValue: string | null): Promise<Doc | null> {
  const parts = splitCookie(cookieValue);
  if (!parts) return null;
  const grantSnap = await db().collection("sessionAccessGrants").doc(parts.grantId).get();
  if (!grantSnap.exists) return null;
  const grant = grantSnap.data();
  if (grant.tokenHash !== hashValue(parts.secret) || toMillis(grant.expiresAt) <= Date.now()) return null;
  const sessionSnap = await db().collection("tableSessions").doc(grant.sessionId).get();
  if (!sessionSnap.exists) return null;
  const session = { id: sessionSnap.id, ...sessionSnap.data() } as Doc;
  return session.restaurantId === grant.restaurantId && session.tableId === grant.tableId ? session : null;
}

export async function verifyAttendanceCode(session: Doc, code: string): Promise<{ ok: true } | { ok: false; limited: boolean }> {
  const firestore = db();
  const ref = firestore.collection("tableSessions").doc(session.id);
  return firestore.runTransaction(async (tx: Db) => {
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
    // The per-IP/table limiter protects against guessing. The whole table is never
    // locked because diners commonly share the restaurant Wi-Fi.
    tx.update(ref, { accessFailedAttempts: (fresh.accessFailedAttempts ?? 0) + 1, accessLockedUntil: null, updatedAt: nowIso() });
    return { ok: false, limited: false };
  });
}

/** Public menu with equality-only queries; filtering and sorting happen here so no composite index is needed. */
export async function loadPublicMenu(restaurantId: string): Promise<{ categories: Doc[]; items: Doc[] }> {
  const firestore = db();
  const [categorySnap, itemSnap] = await Promise.all([
    firestore.collection("menuCategories").where("restaurantId", "==", restaurantId).get(),
    firestore.collection("menuItems").where("restaurantId", "==", restaurantId).get()
  ]);
  const bySort = (a: Doc, b: Doc) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) || String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR");
  const categories = categorySnap.docs
    .map((doc: Doc) => ({ id: doc.id, ...doc.data() }))
    .filter((category: Doc) => category.isActive !== false)
    .sort(bySort)
    .map((category: Doc) => ({ id: category.id, name: String(category.name ?? "Sem nome"), description: String(category.description ?? ""), sortOrder: Number(category.sortOrder ?? 0), isActive: true }));
  const activeCategoryIds = new Set(categories.map((category: Doc) => category.id));
  const items = itemSnap.docs
    .map((doc: Doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item: Doc) => item.isActive !== false && item.isAvailable !== false && activeCategoryIds.has(item.categoryId) && Number.isFinite(Number(item.price)))
    .sort(bySort)
    .map((item: Doc) => ({ id: item.id, categoryId: item.categoryId, name: String(item.name ?? ""), description: String(item.description ?? ""), price: Number(item.price), imageUrl: typeof item.imageUrl === "string" && item.imageUrl ? item.imageUrl : null, preparationTimeMinutes: Number(item.preparationTimeMinutes ?? 0), isActive: true, isAvailable: true, isFeatured: item.isFeatured === true, sortOrder: Number(item.sortOrder ?? 0) }));
  return { categories, items };
}

export async function createOperationalEvent(input: {
  restaurantId: string;
  tableId: string;
  sessionId: string;
  orderId?: string;
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
  actorType?: "staff" | "customer" | "system";
  actorId?: string | null;
}): Promise<void> {
  await db().collection("orderEvents").add({
    restaurantId: input.restaurantId,
    tableId: input.tableId,
    sessionId: input.sessionId,
    orderId: input.orderId ?? "system",
    actorType: input.actorType ?? "system",
    actorId: input.actorId ?? null,
    type: input.type,
    message: input.message,
    metadata: input.metadata ?? {},
    createdAt: nowIso()
  });
}
