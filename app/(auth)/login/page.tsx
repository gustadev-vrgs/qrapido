"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type LoginInput, loginSchema } from "@/lib/schemas";
import { AuthError, persistStaffSessionCookie, signInStaff } from "@/lib/services/auth";

export default function LoginPage(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginInput): Promise<void> => {
    try {
      const credential = await signInStaff(values);
      const idToken = await credential.user.getIdToken();
      await persistStaffSessionCookie(idToken);

      sessionStorage.setItem("qrapido_staff_session_hint", "ok");
      toast.success("Acesso autorizado");
      router.push(searchParams.get("next") ?? "/admin/dashboard");
    } catch (error) {
      const message = error instanceof AuthError ? error.message : "Credenciais inválidas ou usuário sem acesso";
      toast.error(message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-graphite-950 via-graphite-900 to-graphite-950 p-4">
      <Card className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Acesso da Equipe</h1>
        <p className="text-sm text-graphite-300">Gestão do atendimento presencial e operações do salão.</p>
        <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
          <Input placeholder="email@restaurante.com" {...register("email")} />
          <Input type="password" placeholder="********" {...register("password")} />
          <Button disabled={formState.isSubmitting} className="w-full" type="submit">
            Entrar no painel
          </Button>
        </form>
      </Card>
    </div>
  );
}
