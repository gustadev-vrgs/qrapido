/**
 * Small, failure-tolerant wrappers around localStorage for the customer page.
 * Private tabs, blocked storage and some in-app browsers throw on access; the
 * page must keep working (just without memory) in those cases.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** crypto.randomUUID is missing on older iOS/Android browsers. */
export function randomKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }
}

export const storageKeys = {
  cart: (token: string) => `qrapido:cart:${token}`,
  csrf: (token: string) => `qrapido:csrf:${token}`,
  attempt: (token: string) => `qrapido:order-attempt:${token}`
};
