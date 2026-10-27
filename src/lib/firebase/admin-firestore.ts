import 'server-only';

import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';

export function getAdminFirestore() {
  return getFirebaseAdminFirestore();
}
