"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn, ShieldCheck } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";

import { useRouter } from "next/navigation";

import { AppActionButton, AppFormField, AppTextInput } from "@/components/ui/app-design-system";
import { canAccessDashboard } from "@/lib/auth/roles";
import { getActiveStaffUser } from "@/lib/auth/staff-user";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { getFirebaseClientAuth, getFirebaseClientFirestore } from "@/lib/firebase/client";
import { adminLoginSchema, type AdminLoginInput } from "@/lib/schemas";

const firebaseErrorMap: Record<string, string> = {
  "auth/invalid-credential": "Credenciais inválidas. Revise e-mail e senha.",
  "auth/invalid-email": "O formato do e-mail é inválido.",
  "auth/invalid-login-credentials": "Credenciais inválidas. Revise e-mail e senha.",
  "auth/operation-not-allowed": "Login por e-mail/senha não está habilitado no Firebase Auth.",
  "auth/user-disabled": "Este usuário está desativado.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexão e tente novamente.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns instantes antes de tentar novamente."
};

export function AdminLoginForm(): JSX.Element {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { isAuthenticated, isLoading } = useAdminAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: "",
      password: ""
    },
    mode: "onBlur"
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const auth = getFirebaseClientAuth();
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const db = getFirebaseClientFirestore();
      const staff = await getActiveStaffUser(db, {
        uid: credential.user.uid,
        email: credential.user.email
      });

      if (!staff) {
        await auth.signOut();
        throw new Error("Usuário autenticado, mas sem registro ativo em staffUsers (por uid/email). Verifique o cadastro no Firestore.");
      }

      if (!canAccessDashboard(staff.role)) {
        await auth.signOut();
        throw new Error("Seu perfil não tem permissão para acessar o painel.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      const firebaseCode = (error as { code?: string }).code;
      const message = (error as Error).message;
      setSubmitError(firebaseErrorMap[firebaseCode ?? ""] ?? message ?? "Não foi possível autenticar. Tente novamente.");
    }
  });

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <AppFormField label="E-mail corporativo" error={errors.email?.message}>
        <AppTextInput type="email" autoComplete="email" placeholder="equipe@restaurante.com" {...register("email")} />
      </AppFormField>

      <AppFormField label="Senha" hint="Use sua credencial administrativa." error={errors.password?.message}>
        <AppTextInput type="password" autoComplete="current-password" placeholder="Digite sua senha" {...register("password")} />
      </AppFormField>

      {submitError ? <p className="rounded-xl border border-[hsl(var(--danger)/0.35)] bg-[hsl(var(--danger)/0.1)] px-3 py-2 text-sm text-[hsl(var(--danger))]">{submitError}</p> : null}

      <AppActionButton type="submit" className="h-11 w-full gap-2" disabled={isSubmitting || isLoading}>
        {isSubmitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Verificando acesso...
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            Entrar no painel
          </>
        )}
      </AppActionButton>

      <div className="flex items-center gap-2 text-xs text-[hsl(var(--foreground-muted))]">
        <ShieldCheck className="h-4 w-4" />
        Sessão protegida com Firebase Auth e validação de perfil de staff ativo.
      </div>
    </form>
  );
}
