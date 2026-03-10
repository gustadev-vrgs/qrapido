import {
  CollectionReference,
  DocumentData,
  DocumentReference,
  Firestore,
  QueryConstraint,
  QueryDocumentSnapshot,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc
} from "firebase/firestore";

import { DataLayerError, NotFoundError } from "@/lib/data/errors";
import { serializeForFirestore } from "@/lib/data/helpers/serialization";
import type { CollectionName } from "@/lib/data/constants/collections";

export function getCollection<T extends DocumentData>(db: Firestore, name: CollectionName): CollectionReference<T> {
  return collection(db, name) as CollectionReference<T>;
}

export function getDocumentRef<T extends DocumentData>(db: Firestore, name: CollectionName, id: string): DocumentReference<T> {
  return doc(db, name, id) as DocumentReference<T>;
}

export function mapSnapshot<T>(snapshot: QueryDocumentSnapshot<DocumentData>, mapper: (id: string, data: DocumentData) => T): T {
  return mapper(snapshot.id, snapshot.data());
}

export async function readOne<T>(
  ref: DocumentReference<DocumentData>,
  mapper: (id: string, data: DocumentData) => T,
  entityName: string
): Promise<T> {
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    throw new NotFoundError(entityName, ref.id);
  }

  return mapper(snapshot.id, snapshot.data());
}

export async function readMany<T>(
  ref: CollectionReference<DocumentData>,
  constraints: QueryConstraint[],
  mapper: (id: string, data: DocumentData) => T
): Promise<T[]> {
  const snapshot = await getDocs(query(ref, ...constraints));
  return snapshot.docs.map((docSnapshot) => mapSnapshot(docSnapshot, mapper));
}

export async function createOne<TInput extends DocumentData>(
  ref: CollectionReference<DocumentData>,
  payload: TInput,
  id?: string
): Promise<string> {
  const serialized = serializeForFirestore(payload);

  if (id) {
    await setDoc(doc(ref, id), serialized);
    return id;
  }

  const created = await addDoc(ref, serialized);
  return created.id;
}

export async function patchOne<TInput extends DocumentData>(
  ref: DocumentReference<DocumentData>,
  payload: TInput
): Promise<void> {
  try {
    await updateDoc(ref, serializeForFirestore(payload));
  } catch (error) {
    throw new DataLayerError("Failed to update Firestore document", "update_failed", {
      refPath: ref.path,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
