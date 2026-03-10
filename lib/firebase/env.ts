import { z } from "zod";

const firebasePublicEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1)
});

const firebaseServerEnvSchema = z.object({
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FIREBASE_USE_EMULATOR: z.enum(["true", "false"]).optional(),
  STAFF_SESSION_COOKIE_NAME: z.string().default("qrapido_staff_session")
});

export type FirebasePublicEnv = z.infer<typeof firebasePublicEnvSchema>;

export function getFirebasePublicEnv(): FirebasePublicEnv | null {
  const parsed = firebasePublicEnvSchema.safeParse(process.env);
  return parsed.success ? parsed.data : null;
}

export function getFirebaseServerEnv(): z.infer<typeof firebaseServerEnvSchema> {
  return firebaseServerEnvSchema.parse(process.env);
}
