import 'server-only';

type FirebaseAdminModules = {
  app: {
    cert: (serviceAccount: {
      projectId: string;
      clientEmail: string;
      privateKey: string;
    }) => unknown;
    getApp: () => unknown;
    getApps: () => unknown[];
    initializeApp: (options: { credential?: unknown; projectId?: string }) => unknown;
  };
  auth: {
    getAuth: (app?: unknown) => unknown;
  };
  firestore: {
    getFirestore: (app?: unknown) => unknown;
  };
};

function loadAdminModules(): FirebaseAdminModules {
  const app = require('firebase-admin/app') as FirebaseAdminModules['app'];
  const auth = require('firebase-admin/auth') as FirebaseAdminModules['auth'];
  const firestore = require('firebase-admin/firestore') as FirebaseAdminModules['firestore'];

  return { app, auth, firestore };
}

const requiredAdminEnv = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY,
} satisfies Record<string, string | undefined>;

function assertAdminEnv() {
  const missing = Object.entries(requiredAdminEnv)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Firebase admin environment variables: ${missing.join(', ')}.`);
  }

  return {
    projectId: requiredAdminEnv.projectId as string,
    clientEmail: requiredAdminEnv.clientEmail as string,
    privateKey: (requiredAdminEnv.privateKey as string).replace(/\\n/g, '\n'),
  };
}

/** Returns presence/format diagnostics only; never returns credential values. */
export function getFirebaseAdminEnvDiagnostics() {
  const privateKey = requiredAdminEnv.privateKey;
  return {
    FIREBASE_PROJECT_ID: requiredAdminEnv.projectId ? "configured" : "missing",
    FIREBASE_CLIENT_EMAIL: requiredAdminEnv.clientEmail && requiredAdminEnv.clientEmail.includes('@') ? "configured" : requiredAdminEnv.clientEmail ? "invalid_format" : "missing",
    FIREBASE_PRIVATE_KEY: !privateKey ? "missing" : privateKey.includes("BEGIN PRIVATE KEY") ? "configured" : "invalid_format",
  } as const;
}

export function getFirebaseAdminApp() {
  const { app } = loadAdminModules();

  if (app.getApps().length > 0) {
    return app.getApp();
  }

  // The Admin SDK deliberately uses Application Default Credentials against
  // emulators. Requiring a production-looking private key here made local/CI
  // integration tests either impossible or dangerously dependent on secrets.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
    if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required when using the Firestore emulator.");
    return app.initializeApp({ projectId });
  }

  const { projectId, clientEmail, privateKey } = assertAdminEnv();

  return app.initializeApp({
    credential: app.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getFirebaseAdminAuth() {
  const { auth } = loadAdminModules();
  return auth.getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore() {
  const { firestore } = loadAdminModules();
  return firestore.getFirestore(getFirebaseAdminApp());
}
