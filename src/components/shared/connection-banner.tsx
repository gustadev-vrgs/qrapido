"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * Firestore keeps showing the last data it had when the connection drops, without any
 * error, so a kitchen tablet offline looked like a quiet queue. `stale` comes from the
 * live listeners (data only from the local cache); offline comes from the browser.
 */
export function ConnectionBanner({ stale = false }: { stale?: boolean }): JSX.Element | null {
  const online = useOnline();
  // A short grace period avoids flashing the banner during the first connection.
  const [showStale, setShowStale] = useState(false);
  useEffect(() => {
    if (!stale) { setShowStale(false); return; }
    const id = window.setTimeout(() => setShowStale(true), 8_000);
    return () => window.clearTimeout(id);
  }, [stale]);
  if (online && !showStale) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[hsl(var(--danger)/0.5)] bg-[hsl(var(--danger)/0.1)] p-3 text-sm font-semibold text-[hsl(var(--danger))]">
      <WifiOff className="h-5 w-5 shrink-0" aria-hidden="true" />
      {online ? "Sem resposta do servidor: os pedidos podem estar desatualizados. Confira a internet." : "Sem internet: os pedidos na tela podem estar desatualizados e novos pedidos não aparecem."}
    </div>
  );
}
