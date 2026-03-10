import { z } from "zod";
import type { DocumentData } from "firebase/firestore";

import { DataLayerError } from "@/lib/data/errors";
import { ensureIsoTimestamp } from "@/lib/data/helpers/serialization";

export function normalizeEntityTimestamps(data: DocumentData): DocumentData {
  return {
    ...data,
    createdAt: ensureIsoTimestamp(data.createdAt),
    updatedAt: ensureIsoTimestamp(data.updatedAt)
  };
}

export function parseWithSchema<T>(schema: z.ZodType<T>, id: string, data: DocumentData, entityName: string): T {
  const parsed = schema.safeParse({ id, ...normalizeEntityTimestamps(data) });

  if (!parsed.success) {
    throw new DataLayerError(`Invalid ${entityName} document`, "invalid_document", {
      id,
      issues: parsed.error.issues
    });
  }

  return parsed.data;
}
