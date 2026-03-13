import { Firestore } from "firebase/firestore";

import { getFirebaseClientFirestore } from "./client";

export function getAdminFirestore() {
  const { getFirebaseAdminFirestore } = require("./admin") as typeof import("./admin");
  return getFirebaseAdminFirestore();
}

export function getClientFirestore(): Firestore {
  return getFirebaseClientFirestore();
}
