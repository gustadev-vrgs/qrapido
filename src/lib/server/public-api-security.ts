import "server-only";

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export const MAX_PUBLIC_BODY_BYTES = 16 * 1024;

export async function readLimitedJson(request: NextRequest, maxBytes = MAX_PUBLIC_BODY_BYTES): Promise<unknown> {
  const announced = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(announced) && announced > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try { return JSON.parse(text); } catch { return null; }
}

export function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json({ error: "O conteúdo enviado excede o limite permitido." }, { status: 413 });
}

export function stableHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function clientIpHint(request: NextRequest): string {
  return (request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 80);
}

export type RateLimitRule = { scope: string; key: string; limit: number; windowSeconds: number };

/**
 * Firestore-backed fixed windows work across all Vercel instances.
 * `expireAt` (a Timestamp) lets the Firestore TTL policy delete old windows.
 */
export async function consumeRateLimits(rules: RateLimitRule[]): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const db = getAdminFirestore() as any;
  const now = Date.now();
  return db.runTransaction(async (tx: any) => {
    const entries = rules.map((rule) => {
      const window = Math.floor(now / (rule.windowSeconds * 1000));
      const id = stableHash(`${rule.scope}:${rule.key}:${window}`);
      return { rule, ref: db.collection("publicRateLimits").doc(id), resetAt: (window + 1) * rule.windowSeconds * 1000 };
    });
    const snaps = await Promise.all(entries.map((entry) => tx.get(entry.ref)));
    let retryAfter = 0;
    entries.forEach((entry, index) => {
      if ((snaps[index].data()?.count ?? 0) >= entry.rule.limit) retryAfter = Math.max(retryAfter, Math.ceil((entry.resetAt - now) / 1000));
    });
    if (retryAfter > 0) return { ok: false, retryAfter };
    entries.forEach((entry, index) => tx.set(entry.ref, { scope: entry.rule.scope, count: (snaps[index].data()?.count ?? 0) + 1, resetAt: new Date(entry.resetAt).toISOString(), expireAt: new Date(entry.resetAt + 3600_000), updatedAt: new Date(now).toISOString() }, { merge: true }));
    return { ok: true };
  });
}

export function rateLimitedResponse(retryAfter: number): NextResponse {
  return NextResponse.json({ error: `Muitas solicitações. Tente novamente em ${retryAfter} segundos.`, retryAfter }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}
