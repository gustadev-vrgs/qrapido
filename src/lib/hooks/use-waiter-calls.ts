"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminApi } from "@/lib/hooks/use-admin-api";
import type { WaiterCall } from "@/lib/types/domain";

/**
 * Open waiter calls, refreshed every few seconds (calls go through the server API).
 * `onNew` runs for calls that appear after the first load (sound/toast).
 */
export function useWaiterCalls(enabled: boolean, onNew?: (call: WaiterCall) => void, intervalMs = 8_000) {
  const api = useAdminApi();
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const known = useRef<Set<string> | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const refresh = useCallback(async () => {
    try {
      const payload = await api<{ calls: WaiterCall[] }>("/api/admin/waiter-calls");
      const list = payload.calls ?? [];
      if (known.current) list.filter((call) => !known.current!.has(call.id)).forEach((call) => onNewRef.current?.(call));
      known.current = new Set(list.map((call) => call.id));
      setCalls(list);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível carregar os chamados.");
    }
  }, [api]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  const resolve = useCallback(async (call: WaiterCall) => {
    // Optimistic: the card disappears right away; the next refresh corrects it if something failed.
    setCalls((current) => current.filter((item) => item.id !== call.id));
    await api("/api/admin/waiter-calls", { callId: call.id, action: "complete" });
    await refresh();
  }, [api, refresh]);

  return { calls, error, refresh, resolve };
}

export function waiterReasonLabel(reason: string): string {
  if (reason === "fazer pagamento") return "Quer pagar a conta";
  if (reason === "solicitar talheres") return "Pediu talheres";
  if (reason === "pedir ajuda") return "Pediu ajuda";
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
