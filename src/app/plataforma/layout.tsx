import type { ReactNode } from "react";

export const metadata = {
  title: "Plataforma · QRápido",
  robots: { index: false, follow: false }
};

export default function PlataformaLayout({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}
