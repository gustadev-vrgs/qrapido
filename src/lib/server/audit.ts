import "server-only";

type Db = any;

/**
 * Permanent record of sensitive team actions (people, access, data cleanup).
 * Only the server writes it, nobody can edit or delete it from the browser, and the
 * test-data cleanup never touches it: it is how the owner finds out who did what.
 */
export async function writeAudit(db: Db, entry: { restaurantId: string; actorId: string; actorName?: string | null; type: string; message: string; metadata?: Record<string, unknown> }): Promise<void> {
  await db.collection("auditLog").doc().set({ ...entry, actorName: entry.actorName ?? null, metadata: entry.metadata ?? {}, createdAt: new Date().toISOString() });
}
