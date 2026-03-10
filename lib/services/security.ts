const requestHistory = new Map<string, number[]>();

export function enforceRateLimit(sessionId: string, maxOrdersPerMinute: number): boolean {
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const values = (requestHistory.get(sessionId) ?? []).filter((timestamp) => timestamp > minuteAgo);
  if (values.length >= maxOrdersPerMinute) {
    requestHistory.set(sessionId, values);
    return false;
  }
  values.push(now);
  requestHistory.set(sessionId, values);
  return true;
}

export function isSessionValid(expiresAtIso: string): boolean {
  return new Date(expiresAtIso).getTime() > Date.now();
}

export function buildDedupeKey(sessionId: string, items: string[]): string {
  return `${sessionId}:${items.slice().sort().join("-")}`;
}
