import 'server-only';

import { getFirebaseAdminAuth } from './admin';

const BEARER_PREFIX = 'Bearer ';

export type VerifiedTokenPayload = {
  uid: string;
  [key: string]: unknown;
};

export function getAdminAuth() {
  return getFirebaseAdminAuth();
}

export async function verifyIdToken(token: string): Promise<VerifiedTokenPayload> {
  const auth = getAdminAuth() as { verifyIdToken: (value: string) => Promise<VerifiedTokenPayload> };
  return auth.verifyIdToken(token);
}

export async function verifyRequestAuthorization(request: Request): Promise<VerifiedTokenPayload> {
  const authorization = request.headers.get('authorization');

  if (!authorization?.startsWith(BEARER_PREFIX)) {
    throw new Error('Missing or invalid Authorization header. Expected Bearer token.');
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();

  if (!token) {
    throw new Error('Authorization token is empty.');
  }

  return verifyIdToken(token);
}
