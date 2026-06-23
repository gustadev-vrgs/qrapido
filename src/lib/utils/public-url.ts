const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getPublicAppBaseUrl(origin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return trimTrailingSlash(configured);

  const fallbackOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  if (fallbackOrigin) return trimTrailingSlash(fallbackOrigin);

  return "http://localhost:3000";
}

export function buildPublicTableUrl(publicToken: string, origin?: string): string {
  return `${getPublicAppBaseUrl(origin)}/mesa/${encodeURIComponent(publicToken)}`;
}

export function isLocalhostUrl(value: string | null | undefined): boolean {
  return Boolean(value && LOCALHOST_PATTERN.test(value));
}

export function resolvePublicTableUrl(input: { publicToken: string; qrCodeValue?: string | null }, origin?: string): string {
  if (input.qrCodeValue && !isLocalhostUrl(input.qrCodeValue)) return input.qrCodeValue;
  return buildPublicTableUrl(input.publicToken, origin);
}
