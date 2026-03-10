import { COLLECTION_NAMES } from "@/lib/types/domain";

export const COLLECTIONS = COLLECTION_NAMES;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
