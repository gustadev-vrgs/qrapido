"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where, type DocumentData, type Query, type Unsubscribe } from "firebase/firestore";

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
}

/**
 * Today's orders plus every order still in progress, kept live with Firestore
 * listeners. Every listener uses equality filters only, so it works on a new
 * project without composite indexes, and each change updates the screen from
 * the snapshot itself (no re-reading the whole collection).
 */
export function useLiveOrders(restaurantId: string | undefined, onNewOrder?: (order: Order) => void): LiveOrdersState {
  const [state, setState] = useState<LiveOrdersState>({ orders: [], loading: true, error: null, dateKey: toRestaurantDateKey() });
  const onNewOrderRef = useRef(onNewOrder);
  onNewOrderRef.current = onNewOrder;

  useEffect(() => {
    if (!restaurantId) return;
    const dateKey = toRestaurantDateKey();
    const db = getClientFirestore();
    const ordersRef = collection(db, "orders");
    const groups = new Map<string, Map<string, Order>>();
    const ready = new Set<string>();
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
      setState({ orders, loading: ready.size < listeners.length, error: null, dateKey });
    };

    for (const [key, listenerQuery] of listeners) {
      unsubscribes.push(onSnapshot(listenerQuery, (snapshot) => {
        groups.set(key, new Map(snapshot.docs.map((doc) => [doc.id, mapOrder(doc.id, doc.data())])));
        ready.add(key);
        publish();
      }, (error) => {
        setState((current) => ({ ...current, loading: false, error: describeFirebaseError(error) }));
      }));
    }

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [restaurantId]);

  return state;
}

const CHIMES = {
  /** New order for the kitchen: two rising notes. */
  order: [880, 1320],
  /** Something ready to take to a table: three quick notes. */
  ready: [988, 1319, 1568],
  /** Customer called the waiter: low-high-low, distinct from orders. */
  call: [660, 990, 660]
} as const;

/** Short chime generated with Web Audio (no asset needed). Browsers only play it after the first tap on the page. */
export function playChime(kind: keyof typeof CHIMES = "order"): void {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    CHIMES[kind].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const start = context.currentTime + index * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.start(start);
      oscillator.stop(start + 0.17);
    });
    window.setTimeout(() => void context.close(), 1000);
  } catch {
    /* sound is a convenience only */
  }
}

export function playNewOrderChime(): void {
  playChime("order");
}
