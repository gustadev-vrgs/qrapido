import { FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFirebasePublicEnv } from "@/lib/firebase/env";

const env = getFirebasePublicEnv();

const config: FirebaseOptions | null = env
  ? {
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID
    }
  : null;

export const firebaseEnabled = Boolean(config);

const app = config ? (getApps().length > 0 ? getApp() : initializeApp(config)) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
