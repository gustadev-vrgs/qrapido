"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface QrGeneratorProps {
  tableLabel: string;
  sessionPath: string;
}

export function QrGenerator({ tableLabel, sessionPath }: QrGeneratorProps): JSX.Element {
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    void QRCode.toDataURL(sessionPath, { width: 280, margin: 1 }).then(setSrc);
  }, [sessionPath]);

  return (
    <Card className="space-y-2">
      <p className="text-sm text-graphite-300">{tableLabel}</p>
      {src ? <img src={src} alt={`QR ${tableLabel}`} className="h-48 w-48 rounded-xl bg-white p-2" /> : <p>Gerando...</p>}
      <p className="text-xs text-graphite-400">URL: {sessionPath}</p>
    </Card>
  );
}
