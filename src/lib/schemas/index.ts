import { z } from "zod";

export * from "@/lib/schemas/domain";

export const restaurantIdSchema = z.string().min(1);

export const adminLoginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve conter ao menos 8 caracteres.")
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
