/**
 * In-memory stand-in for the parts of the Firebase Admin SDK used by the API
 * routes. Integration tests swap `@/lib/firebase/admin` for this module through
 * tests/integration/tsconfig.json, so the real route handlers run unchanged.
 *
 * Besides storing documents it mimics two production behaviours that matter
 * for this app:
 *  - transactions must read before they write;
 *  - queries combining equality filters with range filters or orderBy on other
 *    fields fail with FAILED_PRECONDITION unless the composite index exists.
 */

type Data = Record<string, unknown>;
type Op = "==" | "in" | ">=" | "<=" | ">" | "<" | "!=";
type Filter = { field: string; op: Op; value: unknown };
type Order = { field: string; dir: "asc" | "desc" };

let autoId = 0;
const nextId = () => `doc${String(++autoId).padStart(6, "0")}${Math.random().toString(36).slice(2, 8)}`;

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function getField(data: Data, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Data)[key] : undefined), data);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  return (a as number | string) < (b as number | string) ? -1 : 1;
}

function matches(data: Data, filter: Filter): boolean {
  const value = getField(data, filter.field);
  switch (filter.op) {
    case "==": return value === filter.value || (filter.value === null && value === null);
    case "in": return (filter.value as unknown[]).includes(value);
    case "!=": return value !== undefined && value !== filter.value;
    case ">=": return value !== undefined && value !== null && compare(value, filter.value) >= 0;
    case "<=": return value !== undefined && value !== null && compare(value, filter.value) <= 0;
    case ">": return value !== undefined && value !== null && compare(value, filter.value) > 0;
    case "<": return value !== undefined && value !== null && compare(value, filter.value) < 0;
  }
}

export class FakeIndexError extends Error {
  code = 9;
  constructor(collection: string, detail: string) {
    super(`9 FAILED_PRECONDITION: The query requires an index (${collection}: ${detail}). You can create it here: https://console.firebase.google.com/fake-index-link`);
  }
}

/** Composite indexes that tests may declare as "published". Empty by default. */
export const publishedIndexes = new Set<string>();

export class FakeDocSnapshot {
  constructor(public readonly ref: FakeDocRef, private readonly stored: Data | undefined) {}
  get id(): string { return this.ref.id; }
  get exists(): boolean { return this.stored !== undefined; }
  data(): Data | undefined { return clone(this.stored); }
}

export class FakeQuerySnapshot {
  constructor(public readonly docs: FakeDocSnapshot[]) {}
  get empty(): boolean { return this.docs.length === 0; }
  get size(): number { return this.docs.length; }
}

export class FakeQuery {
  constructor(
    protected readonly db: FakeFirestore,
    public readonly collectionName: string,
    protected readonly filters: Filter[] = [],
    protected readonly orders: Order[] = [],
    protected readonly max: number | null = null
  ) {}

  where(field: string, op: Op, value: unknown): FakeQuery {
    return new FakeQuery(this.db, this.collectionName, [...this.filters, { field, op, value }], this.orders, this.max);
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc"): FakeQuery {
    return new FakeQuery(this.db, this.collectionName, this.filters, [...this.orders, { field, dir }], this.max);
  }

  limit(n: number): FakeQuery {
    return new FakeQuery(this.db, this.collectionName, this.filters, this.orders, n);
  }

  /** Mirrors when Firestore can answer a query with automatic single-field indexes only. */
  private assertIndexable(): void {
    const equality = new Set(this.filters.filter((f) => f.op === "==" || f.op === "in").map((f) => f.field));
    const ranged = new Set([...this.filters.filter((f) => !["==", "in"].includes(f.op)).map((f) => f.field), ...this.orders.map((o) => o.field)]);
    if (ranged.size === 0) return; // equality-only queries are served by index merging
    if (equality.size === 0 && ranged.size === 1) return; // single-field range/order
    const key = `${this.collectionName}:${[...equality].sort().join(",")}|${[...ranged].join(",")}`;
    if (!publishedIndexes.has(key)) throw new FakeIndexError(this.collectionName, key);
  }

  async get(): Promise<FakeQuerySnapshot> {
    this.assertIndexable();
    const collection = this.db.store.get(this.collectionName) ?? new Map<string, Data>();
    let rows = [...collection.entries()].filter(([, data]) => this.filters.every((f) => matches(data, f)));
    for (const order of [...this.orders].reverse()) {
      rows = rows.sort(([, a], [, b]) => compare(getField(a, order.field), getField(b, order.field)) * (order.dir === "desc" ? -1 : 1));
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    return new FakeQuerySnapshot(rows.map(([id, data]) => new FakeDocSnapshot(new FakeDocRef(this.db, this.collectionName, id), data)));
  }
}

export class FakeDocRef {
  constructor(private readonly db: FakeFirestore, public readonly collectionName: string, public readonly id: string) {}
  get path(): string { return `${this.collectionName}/${this.id}`; }
  private table(): Map<string, Data> {
    if (!this.db.store.has(this.collectionName)) this.db.store.set(this.collectionName, new Map());
    return this.db.store.get(this.collectionName)!;
  }
  async get(): Promise<FakeDocSnapshot> { return new FakeDocSnapshot(this, this.table().get(this.id)); }
  async set(data: Data, options?: { merge?: boolean }): Promise<void> { this.setSync(data, options); }
  async update(data: Data): Promise<void> { this.updateSync(data); }
  async create(data: Data): Promise<void> { this.createSync(data); }
  async delete(): Promise<void> { this.table().delete(this.id); }

  setSync(data: Data, options?: { merge?: boolean }): void {
    const current = this.table().get(this.id);
    this.table().set(this.id, options?.merge && current ? { ...current, ...clone(data) } : clone(data));
  }
  updateSync(data: Data): void {
    const current = this.table().get(this.id);
    if (!current) throw Object.assign(new Error(`5 NOT_FOUND: No document to update: ${this.path}`), { code: 5 });
    this.table().set(this.id, { ...current, ...clone(data) });
  }
  createSync(data: Data): void {
    if (this.table().has(this.id)) throw Object.assign(new Error(`6 ALREADY_EXISTS: ${this.path}`), { code: 6 });
    this.table().set(this.id, clone(data));
  }
}

export class FakeCollectionRef extends FakeQuery {
  doc(id?: string): FakeDocRef { return new FakeDocRef(this.db, this.collectionName, id ?? nextId()); }
  async add(data: Data): Promise<FakeDocRef> {
    const ref = this.doc();
    ref.createSync(data);
    return ref;
  }
}

class FakeTransaction {
  private wrote = false;
  async get(target: FakeDocRef | FakeQuery): Promise<FakeDocSnapshot | FakeQuerySnapshot> {
    if (this.wrote) throw new Error("Firestore transactions require all reads to be executed before all writes.");
    return target.get();
  }
  set(ref: FakeDocRef, data: Data, options?: { merge?: boolean }): this { this.wrote = true; ref.setSync(data, options); return this; }
  update(ref: FakeDocRef, data: Data): this { this.wrote = true; ref.updateSync(data); return this; }
  create(ref: FakeDocRef, data: Data): this { this.wrote = true; ref.createSync(data); return this; }
  delete(ref: FakeDocRef): this { this.wrote = true; void ref.delete(); return this; }
}

export class FakeFirestore {
  store = new Map<string, Map<string, Data>>();
  collection(name: string): FakeCollectionRef { return new FakeCollectionRef(this, name); }
  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    // Snapshot so a thrown error rolls the transaction back, as in production.
    const backup = new Map([...this.store.entries()].map(([name, docs]) => [name, new Map([...docs.entries()].map(([id, data]) => [id, clone(data)]))]));
    try {
      return await fn(new FakeTransaction());
    } catch (error) {
      this.store = backup;
      throw error;
    }
  }
  all(name: string): Array<Data & { id: string }> {
    return [...(this.store.get(name) ?? new Map<string, Data>()).entries()].map(([id, data]) => ({ id, ...clone(data) }));
  }
  reset(): void { this.store.clear(); publishedIndexes.clear(); }
}

export const fakeDb = new FakeFirestore();

/** Test ID tokens look like `test-token:<uid>`; anything else is rejected like an invalid JWT. */
interface FakeAuthUser { uid: string; email: string; password: string; displayName?: string; disabled: boolean; tokensRevokedAt?: number }

export const fakeAuth = {
  users: new Map<string, FakeAuthUser>(),
  reset(): void { this.users.clear(); },
  /** "test-token:<uid>" or "test-token:<uid>|<email>|verified" (platform tests need e-mail claims). */
  async verifyIdToken(token: string): Promise<{ uid: string; email: string | null; email_verified?: boolean }> {
    if (!token.startsWith("test-token:")) throw Object.assign(new Error("Decoding Firebase ID token failed."), { code: "auth/argument-error" });
    const [uid, email, verified] = token.slice("test-token:".length).split("|");
    return { uid, email: email ?? null, email_verified: verified === "verified" };
  },
  async createUser(input: { email: string; password: string; displayName?: string }): Promise<{ uid: string }> {
    if ([...this.users.values()].some((user) => user.email === input.email)) throw Object.assign(new Error("The email address is already in use by another account."), { code: "auth/email-already-exists" });
    if (input.password.length < 6) throw Object.assign(new Error("weak"), { code: "auth/invalid-password" });
    const uid = `uid-${this.users.size + 1}-${input.email.split("@")[0]}`;
    this.users.set(uid, { uid, email: input.email, password: input.password, displayName: input.displayName, disabled: false });
    return { uid };
  },
  async getUserByEmail(email: string): Promise<{ uid: string }> {
    const user = [...this.users.values()].find((item) => item.email === email);
    if (!user) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
    return { uid: user.uid };
  },
  async updateUser(uid: string, input: { password?: string; displayName?: string; disabled?: boolean }): Promise<void> {
    const user = this.users.get(uid);
    if (!user) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
    this.users.set(uid, { ...user, ...input });
  },
  async revokeRefreshTokens(uid: string): Promise<void> {
    const user = this.users.get(uid);
    if (user) user.tokensRevokedAt = Date.now();
  }
};

export function getFirebaseAdminApp(): unknown { return {}; }
export function getFirebaseAdminAuth(): unknown { return fakeAuth; }
export function getFirebaseAdminFirestore(): unknown { return fakeDb; }
export function getFirebaseAdminEnvDiagnostics() {
  return { FIREBASE_PROJECT_ID: "configured", FIREBASE_CLIENT_EMAIL: "configured", FIREBASE_PRIVATE_KEY: "configured" } as const;
}
export function getFirebaseAdminConfigStatus() {
  return { ok: true as const, source: "test" as const, projectId: "demo-test", problems: [] as string[] };
}
