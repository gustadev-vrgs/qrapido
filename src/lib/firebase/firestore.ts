import { Firestore } from "firebase/firestore";

import { getFirebaseClientFirestore } from "./client";

export function getClientFirestore(): Firestore {
  return getFirebaseClientFirestore();
}
