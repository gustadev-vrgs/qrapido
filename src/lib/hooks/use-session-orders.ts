"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { describeFirebaseError } from "@/lib/data/errors";
import { mapOrder } from "@/lib/data/mappers/domain-mappers";
import { getClientFirestore } from "@/lib/firebase/firestore";
import type { Order } from "@/lib/types/domain";

/** Every order of one attendance (the table's current bill), live. Equality filters only. */
export function useSessionOrders(restaurantId: string | undefined, sessionId: string | null | undefined): { orders: Order[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ key: string; orders: Order[]; error: string | null } | null>(null);
  const key = restaurantId && sessionId ? `${restaurantId}:${sessionId}` : "";

  useEffect(() => {
    if (!restaurantId || !sessionId) return;
    const current = `${restaurantId}:${sessionId}`;
    const ordersQuery = query(collection(getClientFirestore(), "orders"), where("restaurantId", "==", restaurantId), where("sessionId", "==", sessionId));
    return onSnapshot(ordersQuery, (snapshot) => {
      setState({ key: current, orders: snapshot.docs.map((doc) => mapOrder(doc.id, doc.data())), error: null });
    }, (failure) => setState({ key: current, orders: [], error: describeFirebaseError(failure) }));
  }, [restaurantId, sessionId]);

  if (!key) return { orders: [], loading: false, error: null };
  if (!state || state.key !== key) return { orders: [], loading: true, error: null };
  return { orders: state.orders, loading: false, error: state.error };
}
