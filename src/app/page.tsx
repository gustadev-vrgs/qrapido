import { redirect } from "next/navigation";

// O QRápido é usado só por estabelecimentos cadastrados: a raiz leva direto ao login.
// Quem já está logado é enviado ao painel pelo próprio formulário de login.
// Clientes do restaurante entram pelo QR Code da mesa (/mesa/[token]) e nunca passam por aqui.
export default function HomePage(): never {
  redirect("/login");
}
