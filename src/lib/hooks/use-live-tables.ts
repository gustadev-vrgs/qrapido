"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import { describeFirebaseError } from "@/lib/data/errors";
import { mapSession, mapTable } from "@/lib/data/mappers/domain-mappers";
import { getClientFirestore } from "@/lib/firebase/firestore";
import type { Table, TableSession } from "@/lib/types/domain";

interface LiveTablesState {
  tables: Table[];
  /** Current attendance of each table (status "active" in Firestore; may already be past its expiresAt). */
  sessionByTable: Record<string, TableSession>;
  loading: boolean;
  error: string | null;
}

/** Tables and their open attendances, live. Equality-only queries: no composite index needed. */
export function useLiveTables(restaurantId: string | undefined): LiveTablesState {
  const [tables, setTables] = useState<Table[] | null>(null);
  const [sessions, setSessions] = useState<TableSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    const db = getClientFirestore();
    const unsubscribeTables = onSnapshot(query(collection(db, "tables"), where("restaurantId", "==", restaurantId)), (snapshot) => {
      setTables(snapshot.docs.map((doc) => mapTable(doc.id, doc.data())).sort((a, b) => a.number - b.number || a.label.localeCompare(b.label, "pt-BR")));
      setError(null);
    }, (failure) => { setError(describeFirebaseError(failure)); setTables((current) => current ?? []); });
    const unsubscribeSessions = onSnapshot(query(collection(db, "tableSessions"), where("restaurantId", "==", restaurantId), where("status", "==", "active")), (snapshot) => {
      setSessions(snapshot.docs.map((doc) => mapSession(doc.id, doc.data())));
    }, (failure) => { setError(describeFirebaseError(failure)); setSessions((current) => current ?? []); });
    return () => { unsubscribeTables(); unsubscribeSessions(); };
  }, [restaurantId]);

  const sessionByTable: Record<string, TableSession> = {};
  for (const table of tables ?? []) {
    const session = (sessions ?? []).find((item) => item.id === table.currentSessionGroupId) ?? (sessions ?? []).find((item) => item.tableId === table.id);
    if (session) sessionByTable[table.id] = session;
  }

  return { tables: tables ?? [], sessionByTable, loading: tables === null || sessions === null, error };
}

export function isSessionExpired(session: TableSession | undefined, now = Date.now()): boolean {
  return Boolean(session && new Date(session.expiresAt).getTime() <= now);
}
