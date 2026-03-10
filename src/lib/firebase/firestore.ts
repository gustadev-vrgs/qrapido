import { Firestore } from 'firebase/firestore';

import { getFirebaseAdminFirestore } from './admin';
import { getFirebaseClientFirestore } from './client';

export function getAdminFirestore() {
  return getFirebaseAdminFirestore();
}

export function getClientFirestore(): Firestore {
  return getFirebaseClientFirestore();
}
