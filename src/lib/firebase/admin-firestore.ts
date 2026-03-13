import 'server-only';

import { getFirebaseAdminFirestore } from './admin';

export function getAdminFirestore() {
  return getFirebaseAdminFirestore();
}
