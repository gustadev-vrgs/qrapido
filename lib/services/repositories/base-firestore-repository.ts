import { addDoc, collection, doc, getDoc, getDocs, query, setDoc, where, type Firestore } from "firebase/firestore";

export class BaseFirestoreRepository<T extends { id: string; restaurantId: string }> {
  constructor(
    private readonly db: Firestore,
    private readonly collectionName: string,
    private readonly parser: (input: unknown) => T
  ) {}

  async listByRestaurant(restaurantId: string): Promise<T[]> {
    const q = query(collection(this.db, this.collectionName), where("restaurantId", "==", restaurantId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((entry) => this.parser({ id: entry.id, ...entry.data() }));
  }

  async getById(id: string): Promise<T | null> {
    const reference = doc(this.db, this.collectionName, id);
    const snapshot = await getDoc(reference);

    if (!snapshot.exists()) {
      return null;
    }

    return this.parser({ id: snapshot.id, ...snapshot.data() });
  }

  async upsert(entity: T): Promise<void> {
    const reference = doc(this.db, this.collectionName, entity.id);
    await setDoc(reference, entity, { merge: true });
  }

  async create(entity: Omit<T, "id">): Promise<string> {
    const reference = await addDoc(collection(this.db, this.collectionName), entity);
    return reference.id;
  }
}
