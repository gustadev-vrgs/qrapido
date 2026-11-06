import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";

export const metadata: Metadata = {
  title: "QRápido",
  description: "Cardápio e pedidos pelo QR Code da mesa, com cozinha e salão em tempo real."
};

/**
 * Applies the saved light/dark theme before the first paint. Without it every page
 * load starts light and switches to dark a moment later (the screen "blinks").
 * Fixed text, no user data: allowed by the CSP's script-src 'unsafe-inline'.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("qrapido-theme")||"light";if(t==="system"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var r=document.documentElement;r.dataset.theme=t;if(t==="dark"){r.classList.add("dark")}}catch(e){}})();`;

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
