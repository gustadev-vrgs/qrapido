"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { FirebaseError } from "firebase/app";

import { useRouter } from "next/navigation";

import { AppActionButton, AppFormField, AppTextInput } from "@/components/ui/app-design-system";
import { getStaffValidationMessage, validateAdminStaffUser } from "@/lib/auth/staff-user";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import { getFirebaseClientAuth, getFirebaseClientFirestore } from "@/lib/firebase/client";
import { describeFirebaseError } from "@/lib/data/errors";
import { adminLoginSchema, type AdminLoginInput } from "@/lib/schemas";

const firebaseErrorMap: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha inválidos. Confira os dados e tente novamente.",
  "auth/invalid-email": "Informe um e-mail válido.",
  "auth/invalid-login-credentials": "E-mail ou senha inválidos. Confira os dados e tente novamente.",
  "auth/wrong-password": "Senha incorreta. Tente novamente.",
  "auth/user-not-found": "E-mail ou senha inválidos. Confira os dados e tente novamente.",
  "auth/operation-not-allowed": "Login por e-mail e senha está desabilitado no Firebase Auth.",
  "auth/user-disabled": "Este usuário está desativado.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexão e tente novamente.",
  "auth/too-many-requests": "Muitas tentativas seguidas. Aguarde um momento antes de tentar novamente."
};


const firestoreErrorMap: Record<string, string> = {
  "permission-denied": "Sem permissão para validar seu acesso administrativo.",
  "unavailable": "Falha de rede. Verifique sua conexão e tente novamente.",
  "deadline-exceeded": "A validação demorou mais que o esperado. Tente novamente.",
  "failed-precondition": "Não foi possível validar seu cadastro administrativo no momento."
};

export function AdminLoginForm(): JSX.Element {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { isAuthenticated, isLoading, authError, clearAuthError } = useAdminAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (!isLoading && authError) {
      setSubmitError(authError);
    }
  }, [authError, isLoading]);

  const [resetState, setResetState] = useState<"idle" | "sending" | "sent">("idle");

  const {
    register,
    handleSubmit,
    clearErrors,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: "",
      password: ""
    },
    mode: "onChange",
    reValidateMode: "onChange"
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    clearAuthError();

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const auth = getFirebaseClientAuth();
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const db = getFirebaseClientFirestore();
      const validation = await validateAdminStaffUser(db, {
        uid: credential.user.uid,
        email: credential.user.email ?? normalizedEmail
      });

      if (validation.error) {
        await auth.signOut();
        setSubmitError(getStaffValidationMessage(validation.error, credential.user.uid));
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      const firebaseCode = (error as { code?: string }).code;

      if (error instanceof FirebaseError && error.code.startsWith("firestore/")) {
        const firestoreCode = error.code.replace("firestore/", "");
        setSubmitError(
          firestoreErrorMap[firestoreCode] ??
            "Não foi possível validar seu cadastro administrativo no momento. Tente novamente."
        );
        return;
      }

      if (firebaseCode && firebaseErrorMap[firebaseCode]) {
        setSubmitError(firebaseErrorMap[firebaseCode]);
        return;
      }
      // Firestore errors (e.g. "permission-denied" when the rules were never published)
      // carry no "auth/" prefix: explain what to fix instead of the raw SDK message.
      setSubmitError(firebaseCode?.startsWith("auth/") ? "Não foi possível autenticar agora. Tente novamente em instantes." : describeFirebaseError(error));
    }
  });

  /** Sends Firebase's reset e-mail. The answer is the same whether or not the e-mail exists. */
  async function handlePasswordReset(): Promise<void> {
    const email = getValues("email").trim().toLowerCase();
    if (!email.includes("@")) {
      setSubmitError("Digite o seu e-mail acima e toque de novo em \"Esqueci minha senha\".");
      return;
    }
    setSubmitError(null);
    setResetState("sending");
    try {
      await sendPasswordResetEmail(getFirebaseClientAuth(), email);
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code === "auth/invalid-email") {
        setSubmitError("Informe um e-mail válido.");
        setResetState("idle");
        return;
      }
      if (code === "auth/network-request-failed" || code === "auth/too-many-requests") {
        setSubmitError(firebaseErrorMap[code]);
        setResetState("idle");
        return;
      }
      // auth/user-not-found and others: same answer, so the screen does not reveal who has an account.
    }
    setResetState("sent");
  }

  function handleFieldEdit(): void {
    if (submitError) {
      setSubmitError(null);
    }
    if (authError) {
      clearAuthError();
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit} noValidate>
      <AppFormField label="E-mail" error={errors.email?.message}>
        <AppTextInput
          type="email"
          autoComplete="email"
          placeholder="equipe@restaurante.com"
          {...register("email", {
            onChange: () => {
              handleFieldEdit();
              clearErrors("email");
            }
          })}
        />
      </AppFormField>

      <AppFormField label="Senha" error={errors.password?.message}>
        <AppTextInput
          type="password"
          autoComplete="current-password"
          placeholder="Digite sua senha"
          {...register("password", {
            onChange: () => {
              handleFieldEdit();
              clearErrors("password");
            }
          })}
        />
      </AppFormField>

      {submitError ? <p className="rounded-xl border border-[hsl(var(--danger)/0.35)] bg-[hsl(var(--danger)/0.1)] px-3 py-2 text-sm text-[hsl(var(--danger))]">{submitError}</p> : null}

      <AppActionButton type="submit" className="h-11 w-full gap-2" disabled={isSubmitting} aria-busy={isSubmitting}>
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

      <div className="text-center text-sm">
        {resetState === "sent" ? (
          <p className="text-[hsl(var(--foreground-muted))]">Se este e-mail tiver acesso, chega em instantes uma mensagem para criar uma nova senha. Confira também o spam.</p>
        ) : (
          <button type="button" className="font-semibold text-[hsl(var(--primary))] underline-offset-2 hover:underline disabled:opacity-60" disabled={resetState === "sending"} onClick={() => void handlePasswordReset()}>
            {resetState === "sending" ? "Enviando..." : "Esqueci minha senha"}
          </button>
        )}
      </div>
    </form>
  );
}
