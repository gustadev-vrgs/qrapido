import { toIsoString } from "@/lib/data/helpers/timestamps";

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]);

    return Object.fromEntries(entries) as T;
  }

  return value;
}

export function serializeForFirestore<T>(value: T): T {
  return stripUndefined(value);
}

export function ensureIsoTimestamp(value: unknown, fallback: string | null = null): string | null {
  return toIsoString(value as never, fallback);
}
