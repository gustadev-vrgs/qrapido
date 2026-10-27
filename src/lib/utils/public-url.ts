const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i;
const PLACEHOLDER_PATTERN = /seu-dominio|your-domain|example\.com/i;

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * The configured NEXT_PUBLIC_APP_URL is only trusted when it is a real public
 * address. A copied placeholder ("seu-dominio.vercel.app") or a localhost value
 * would print QR Codes that phones can never open, so in those cases the
 * address the panel is actually running on wins.
 */
export function isUsablePublicBaseUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(trimmed)) return false;
  return !PLACEHOLDER_PATTERN.test(trimmed) && !LOCALHOST_PATTERN.test(trimmed);
}

export function getPublicAppBaseUrl(origin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fallbackOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (isUsablePublicBaseUrl(configured)) return trimTrailingSlash(configured);
  if (fallbackOrigin) return trimTrailingSlash(fallbackOrigin);
  return "http://localhost:3000";
}

/** Explains why the QR address may not open on a phone; null when it looks fine. */
export function describePublicUrlProblem(origin?: string): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = getPublicAppBaseUrl(origin);
  if (configured && !isUsablePublicBaseUrl(configured)) {
    return `NEXT_PUBLIC_APP_URL ("${configured}") não é um endereço público válido e foi ignorado; os QR Codes usam ${base}.`;
  }
  if (LOCALHOST_PATTERN.test(base)) {
    return "Os QR Codes apontam para localhost: o celular não consegue abrir. Use o endereço publicado na Vercel ou o IP do computador na rede.";
  }
  return null;
}

export function buildPublicTableUrl(publicToken: string, origin?: string): string {
  return `${getPublicAppBaseUrl(origin)}/mesa/${encodeURIComponent(publicToken)}`;
}

export function isLocalhostUrl(value: string | null | undefined): boolean {
  return Boolean(value && LOCALHOST_PATTERN.test(value));
}

export function resolvePublicTableUrl(input: { publicToken: string; qrCodeValue?: string | null }, origin?: string): string {
  // Tokens are the durable identity. Always rebuild the URL from the public domain
  // so links saved by older deployments are never reused.
  return buildPublicTableUrl(input.publicToken, origin);
}

export const PUBLIC_TABLE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{16,128}$/;

export function isValidPublicTableToken(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_TABLE_TOKEN_PATTERN.test(value) && value !== "legacy-token-placeholder";
}
