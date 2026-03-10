import type { Firestore } from "firebase/firestore";

import { getClientFirestore } from "@/lib/firebase/firestore";

export type AccessScope = "public" | "admin";

export interface ServiceContext {
  db?: Firestore;
  scope?: AccessScope;
}

export function resolveContext(context?: ServiceContext): Required<ServiceContext> {
  return {
    db: context?.db ?? getClientFirestore(),
    scope: context?.scope ?? "public"
  };
}
