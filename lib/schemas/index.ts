import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const tableSchema = z.object({
  number: z.string().min(1).max(20),
  capacity: z.number().int().min(1).max(20),
  status: z.enum(["inactive", "active", "occupied", "closing"])
});

export const sessionSchema = z.object({
  tableId: z.string().min(1),
  customerName: z.string().max(40).optional(),
  peopleCount: z.number().int().min(1).max(20)
});

export const orderRequestSchema = z.object({
  sessionId: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1),
  notes: z.string().max(200).optional(),
  dedupeKey: z.string().min(8)
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TableInput = z.infer<typeof tableSchema>;
export type SessionInput = z.infer<typeof sessionSchema>;
export type OrderRequestInput = z.infer<typeof orderRequestSchema>;
