import { redirect } from "next/navigation";

// Links antigos continham um segredo de sessão e não podem ser convertidos em
// autorização. Direcionamos ao início sem reutilizar nem registrar esse valor.
export default function LegacyTableLink(): never {
  redirect("/?mesa=link-antigo");
}
