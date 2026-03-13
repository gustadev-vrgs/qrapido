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

function hasServiceAccountEnv(): boolean {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApp();
  }

  if (hasServiceAccountEnv()) {
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID as string,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL as string,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY as string).replace(/\\n/g, "\n"),
      }),
    });
  }

  return initializeApp({ credential: applicationDefault() });
}

export async function upsertStaffUser(db: Firestore, payload: StaffUserRecord): Promise<void> {
  const docRef = db.collection(STAFF_COLLECTION).doc(payload.uid);
  await docRef.set(payload, { merge: true });
}

async function ensureAuthUserExists(uid: string): Promise<void> {
  const auth = getAuth();
  await auth.getUser(uid);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

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

  console.log("[bootstrap-admin] ✅ Staff admin criado/atualizado com sucesso.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[bootstrap-admin] ❌ Falha: ${message}`);
  process.exitCode = 1;
});
