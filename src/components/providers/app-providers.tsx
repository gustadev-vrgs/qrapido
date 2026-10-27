"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Global providers only. Firebase Auth lives in the (auth) and dashboard layouts:
 * the customer page (/mesa) must work on any phone even if the staff login
 * configuration is missing or broken.
 */
export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster richColors position="top-right" closeButton />
      </MotionConfig>
    </ThemeProvider>
  );
}
