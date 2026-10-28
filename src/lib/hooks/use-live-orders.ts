"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where, type DocumentData, type Query, type Unsubscribe } from "firebase/firestore";

import { playChime } from "@/lib/audio/chime";
import { describeFirebaseError } from "@/lib/data/errors";
import { mapOrder } from "@/lib/data/mappers/domain-mappers";
import { ACTIVE_ORDER_STATUSES } from "@/lib/data/services/orders-service";
import { getClientFirestore } from "@/lib/firebase/firestore";
import type { Order } from "@/lib/types/domain";
import { toRestaurantDateKey } from "@/lib/utils/date-key";

interface LiveOrdersState {
  orders: Order[];
  loading: boolean;
  error: string | null;
  dateKey: string;
  /** True while some listener only has data from the local cache (connection lost or not confirmed yet). */
  stale: boolean;
}

/** The restaurant's calendar day, rechecked every minute so a panel left on overnight moves to the new day. */
function useRestaurantDateKey(): string {
  const [dateKey, setDateKey] = useState(() => toRestaurantDateKey());
  useEffect(() => {
    const id = window.setInterval(() => {
      const current = toRestaurantDateKey();
      setDateKey((previous) => (previous === current ? previous : current));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return dateKey;
}

/**
 * Today's orders plus every order still in progress, kept live with Firestore
 * listeners. Every listener uses equality filters only, so it works on a new
 * project without composite indexes, and each change updates the screen from
 * the snapshot itself (no re-reading the whole collection).
 */
export function useLiveOrders(restaurantId: string | undefined, onNewOrder?: (order: Order) => void): LiveOrdersState {
  const dateKey = useRestaurantDateKey();
  const [state, setState] = useState<LiveOrdersState>({ orders: [], loading: true, error: null, dateKey, stale: false });
  const onNewOrderRef = useRef(onNewOrder);
  onNewOrderRef.current = onNewOrder;

  useEffect(() => {
    if (!restaurantId) return;
    const db = getClientFirestore();
    const ordersRef = collection(db, "orders");
    const groups = new Map<string, Map<string, Order>>();
    const ready = new Set<string>();
    const fromCache = new Set<string>();
    const known = new Set<string>();
    let initialized = false;
    const unsubscribes: Unsubscribe[] = [];

    const listeners: Array<[string, Query<DocumentData>]> = [
      ["today", query(ordersRef, where("restaurantId", "==", restaurantId), where("dateKey", "==", dateKey))],
      ...ACTIVE_ORDER_STATUSES.map((status): [string, Query<DocumentData>] => [`status:${status}`, query(ordersRef, where("restaurantId", "==", restaurantId), where("status", "==", status))])
    ];

    const publish = () => {
      const merged = new Map<string, Order>();
      groups.forEach((group) => group.forEach((order, id) => merged.set(id, order)));
      const orders = [...merged.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      if (initialized) {
        orders.filter((order) => !known.has(order.id) && (order.status === "received" || order.status === "ready")).forEach((order) => onNewOrderRef.current?.(order));
      }
      orders.forEach((order) => known.add(order.id));
      if (ready.size === listeners.length) initialized = true;
      setState({ orders, loading: ready.size < listeners.length, error: null, dateKey, stale: fromCache.size > 0 });
    };

    for (const [key, listenerQuery] of listeners) {
      unsubscribes.push(onSnapshot(listenerQuery, { includeMetadataChanges: true }, (snapshot) => {
        groups.set(key, new Map(snapshot.docs.map((doc) => [doc.id, mapOrder(doc.id, doc.data())])));
        if (snapshot.metadata.fromCache) fromCache.add(key); else fromCache.delete(key);
        ready.add(key);
        publish();
      }, (error) => {
        setState((current) => ({ ...current, loading: false, error: describeFirebaseError(error) }));
      }));
    }

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [restaurantId, dateKey]);

  return state;
}

// Chimes live in lib/audio/chime (one shared, unlockable AudioContext); re-exported for existing imports.
export { playChime };

export function playNewOrderChime(): void {
  playChime("order");
}
