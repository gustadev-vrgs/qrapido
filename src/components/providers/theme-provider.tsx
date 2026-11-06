"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light" | "system";

type ResolvedTheme = Exclude<Theme, "system">;

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyResolvedTheme(resolvedTheme: ResolvedTheme) {
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
}

function readSavedTheme(storageKey: string, fallback: Theme): Theme {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === "dark" || saved === "light" || saved === "system" ? saved : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children, defaultTheme = "light", storageKey = "qrapido-theme" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(resolveTheme(defaultTheme));
  // Until the saved choice is read, never write or apply the default: that is what
  // made every page load flash light before going dark.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const savedTheme = readSavedTheme(storageKey, defaultTheme);
    setThemeState(savedTheme);
    setResolvedTheme(resolveTheme(savedTheme));
    setReady(true);
  }, [storageKey, defaultTheme]);

  useEffect(() => {
    if (!ready) return;
    const nextResolvedTheme = resolveTheme(theme);
    setResolvedTheme(nextResolvedTheme);
    applyResolvedTheme(nextResolvedTheme);
    try { window.localStorage.setItem(storageKey, theme); } catch { /* private mode */ }

    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      const nextSystemTheme = getSystemTheme();
      setResolvedTheme(nextSystemTheme);
      applyResolvedTheme(nextSystemTheme);
    };
    media.addEventListener("change", listener);

    return () => media.removeEventListener("change", listener);
  }, [theme, storageKey, ready]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: setThemeState
    }),
    [theme, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return context;
}
