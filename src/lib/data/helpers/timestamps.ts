import type { Timestamp } from "firebase/firestore";

export type TimestampLike = Timestamp | Date | string | number | null | undefined;

export function toDate(value: TimestampLike): Date | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  return null;
}

export function toIsoString(value: TimestampLike, fallback: string | null = null): string | null {
  const parsed = toDate(value);
  return parsed ? parsed.toISOString() : fallback;
}

export function nowIsoString(): string {
  return new Date().toISOString();
}
