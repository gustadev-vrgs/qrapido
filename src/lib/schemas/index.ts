import { z } from "zod";

export const restaurantIdSchema = z.string().min(1);

export const shellLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export type ShellLoginInput = z.infer<typeof shellLoginSchema>;
