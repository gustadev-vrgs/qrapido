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
    initializeApp: (options: { credential: unknown }) => unknown;
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

export function getFirebaseAdminApp() {
  const { app } = loadAdminModules();

  if (app.getApps().length > 0) {
    return app.getApp();
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
