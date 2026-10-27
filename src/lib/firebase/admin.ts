import 'server-only';

type FirebaseAdminModules = {
  app: {
    cert: (serviceAccount: { projectId: string; clientEmail: string; privateKey: string }) => unknown;
    getApp: () => unknown;
    getApps: () => unknown[];
    initializeApp: (options: { credential: unknown; projectId?: string }) => unknown;
  };
  auth: { getAuth: (app?: unknown) => unknown };
  firestore: { getFirestore: (app?: unknown) => unknown };
};

function loadAdminModules(): FirebaseAdminModules {
  const app = require('firebase-admin/app') as FirebaseAdminModules['app'];
  const auth = require('firebase-admin/auth') as FirebaseAdminModules['auth'];
  const firestore = require('firebase-admin/firestore') as FirebaseAdminModules['firestore'];
  return { app, auth, firestore };
}

export class FirebaseAdminConfigError extends Error {
  readonly code = 'firebase_admin_config';
  constructor(public readonly problems: string[]) {
    super(`Firebase Admin não configurado: ${problems.join(' ')}`);
    this.name = 'FirebaseAdminConfigError';
  }
}

interface ServiceAccount { projectId: string; clientEmail: string; privateKey: string }

/** Strips what usually comes along when a key is pasted into the Vercel dashboard: wrapping quotes and escaped newlines. */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
  return key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim() + '\n';
}

function stripQuotes(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^["']|["']$/g, '');
}

/** Accepts the whole service-account JSON (plain or base64) in FIREBASE_SERVICE_ACCOUNT, or the three separate variables. */
function readServiceAccount(): { account: ServiceAccount | null; source: 'service_account_json' | 'separate_variables' | 'none'; problems: string[] } {
  const problems: string[] = [];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (json) {
    try {
      const text = json.startsWith('{') ? json : Buffer.from(json, 'base64').toString('utf8');
      const parsed = JSON.parse(text) as { project_id?: string; client_email?: string; private_key?: string };
      if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        problems.push('FIREBASE_SERVICE_ACCOUNT não contém project_id, client_email e private_key.');
      } else {
        return { account: { projectId: parsed.project_id, clientEmail: parsed.client_email, privateKey: normalizePrivateKey(parsed.private_key) }, source: 'service_account_json', problems };
      }
    } catch {
      problems.push('FIREBASE_SERVICE_ACCOUNT não é um JSON válido (cole o arquivo da conta de serviço inteiro ou em base64).');
    }
  }

  const projectId = stripQuotes(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = stripQuotes(process.env.FIREBASE_CLIENT_EMAIL);
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId) problems.push('FIREBASE_PROJECT_ID ausente.');
  if (!clientEmail) problems.push('FIREBASE_CLIENT_EMAIL ausente.');
  else if (!clientEmail.includes('@')) problems.push('FIREBASE_CLIENT_EMAIL não parece um e-mail de conta de serviço.');
  if (!rawKey?.trim()) problems.push('FIREBASE_PRIVATE_KEY ausente.');
  const privateKey = rawKey ? normalizePrivateKey(rawKey) : '';
  if (rawKey && !(privateKey.includes('-----BEGIN PRIVATE KEY-----') && privateKey.includes('-----END PRIVATE KEY-----'))) {
    problems.push('FIREBASE_PRIVATE_KEY incompleta: copie desde -----BEGIN PRIVATE KEY----- até -----END PRIVATE KEY-----.');
  }
  if (projectId && clientEmail?.includes('@') && privateKey.includes('-----END PRIVATE KEY-----')) {
    return { account: { projectId, clientEmail, privateKey }, source: 'separate_variables', problems: [] };
  }
  return { account: null, source: 'none', problems };
}

/** Configuration status for diagnostics. Never returns credential values. */
export function getFirebaseAdminConfigStatus(): { ok: boolean; source: string; projectId: string | null; problems: string[] } {
  const { account, source, problems } = readServiceAccount();
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || null;
  const allProblems = [...problems];
  if (account && clientProjectId && clientProjectId !== account.projectId) {
    allProblems.push(`O projeto do servidor (${account.projectId}) é diferente do projeto do site (${clientProjectId}); os logins da equipe serão recusados. Use a conta de serviço do mesmo projeto Firebase.`);
  }
  return { ok: Boolean(account) && allProblems.length === 0, source, projectId: account?.projectId ?? null, problems: allProblems };
}

/** Kept for older callers: presence/format only. */
export function getFirebaseAdminEnvDiagnostics() {
  const status = getFirebaseAdminConfigStatus();
  return { ok: status.ok, source: status.source, problems: status.problems } as const;
}

export function getFirebaseAdminApp() {
  const { app } = loadAdminModules();
  if (app.getApps().length > 0) return app.getApp();

  const { account, problems } = readServiceAccount();
  if (!account) throw new FirebaseAdminConfigError(problems);

  return app.initializeApp({ credential: app.cert(account), projectId: account.projectId });
}

export function getFirebaseAdminAuth() {
  const { auth } = loadAdminModules();
  return auth.getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore() {
  const { firestore } = loadAdminModules();
  return firestore.getFirestore(getFirebaseAdminApp());
}
