import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cert, getApp, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

type BootstrapArgs = {
  uid: string;
  email: string;
  name: string;
  restaurantId: string;
};

type StaffUserRecord = {
  uid: string;
  email: string;
  name: string;
  role: "admin";
  restaurantId: string;
  isActive: true;
};

const STAFF_COLLECTION = "staffUsers";

function parseArgs(argv: string[]): BootstrapArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Parâmetro sem valor: --${key}`);
    }

    values.set(key, value);
    index += 1;
  }

  const uid = values.get("uid")?.trim();
  const email = values.get("email")?.trim().toLowerCase();
  const name = values.get("name")?.trim();
  const restaurantId = values.get("restaurantId")?.trim();

  if (!uid || !email || !name || !restaurantId) {
    throw new Error(
      "Uso: npm run seed:staff-admin -- --uid <UID> --email <EMAIL> --name \"<NOME>\" --restaurantId <RESTAURANT_ID>",
    );
  }

  return { uid, email, name, restaurantId };
}

/** npm scripts do not read .env.local; load it so the same variables used by the app work here. */
function loadEnvFile(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
}

function serviceAccountFromJson(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  const parsed = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as { project_id: string; client_email: string; private_key: string };
  return { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: parsed.private_key.replace(/\\n/g, "\n") };
}

function hasServiceAccountEnv(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApp();
  }

  const fromJson = serviceAccountFromJson();
  if (fromJson) return initializeApp({ credential: cert(fromJson) });

  if (hasServiceAccountEnv()) {
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID as string,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL as string,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY as string).trim().replace(/^["']|["']$/g, "").replace(/\\n/g, "\n"),
      }),
    });
  }

  return initializeApp({ credential: applicationDefault() });
}

export async function upsertStaffUser(db: Firestore, payload: StaffUserRecord): Promise<void> {
  const docRef = db.collection(STAFF_COLLECTION).doc(payload.uid);
  const now = new Date().toISOString();
  const existing = await docRef.get();
  await docRef.set({ ...payload, ...(existing.exists ? {} : { createdAt: now }), updatedAt: now }, { merge: true });
}

/** The restaurant document id must be the restaurantId (Firestore rules check it). */
async function ensureRestaurant(db: Firestore, restaurantId: string): Promise<void> {
  const ref = db.collection("restaurants").doc(restaurantId);
  if ((await ref.get()).exists) return;
  const now = new Date().toISOString();
  await ref.set({ restaurantId, name: "Meu Restaurante", slug: restaurantId.toLowerCase(), description: "", address: "", phone: "", logoUrl: null, isActive: true, createdAt: now, updatedAt: now });
  console.log(`[bootstrap-admin] Restaurante restaurants/${restaurantId} criado (edite o nome em Configurações).`);
}

async function ensureAuthUserExists(uid: string): Promise<void> {
  const auth = getAuth();
  await auth.getUser(uid);
}

async function main(): Promise<void> {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(args.restaurantId)) throw new Error("restaurantId deve ter só letras, números, - ou _ (ex.: cantina-da-praca).");

  console.log("[bootstrap-admin] Inicializando Firebase Admin SDK...");
  initializeFirebaseAdmin();

  console.log(`[bootstrap-admin] Validando existência do usuário Auth: ${args.uid}`);
  await ensureAuthUserExists(args.uid);

  const record: StaffUserRecord = {
    uid: args.uid,
    email: args.email,
    name: args.name,
    role: "admin",
    restaurantId: args.restaurantId,
    isActive: true,
  };

  console.log(`[bootstrap-admin] Fazendo upsert em ${STAFF_COLLECTION}/${record.uid}...`);
  await upsertStaffUser(getFirestore(), record);
  await ensureRestaurant(getFirestore(), args.restaurantId);

  console.log("[bootstrap-admin] ✅ Staff admin criado/atualizado com sucesso.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[bootstrap-admin] ❌ Falha: ${message}`);
  process.exitCode = 1;
});
