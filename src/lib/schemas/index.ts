import { z } from "zod";

export * from "@/lib/schemas/domain";

export const restaurantIdSchema = z.string().min(1);

export const adminLoginSchema = z.object({
  email: z.string().trim().min(1, "Informe seu e-mail.").email("Informe um e-mail válido."),
  // No length rule at login: accounts created with 6-7 characters must still get in.
  // The minimum (8) is enforced when a password is created or changed.
  password: z.string().min(1, "Informe sua senha.")
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
