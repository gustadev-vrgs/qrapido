"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Plus, RefreshCw, UserCheck, UserX, Users } from "lucide-react";

import { AppActionButton, AppEmptyState, AppFormField, AppSkeleton, AppSurface, AppTextInput } from "@/components/ui/app-design-system";
import { AppModal } from "@/components/ui/app-modal";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { useAdminApi } from "@/lib/hooks/use-admin-api";
import { useAdminAuth } from "@/lib/hooks/use-admin-auth";
import type { UserRole } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { appToast } from "@/lib/utils/toast";

interface Member { uid: string; name: string; email: string; role: UserRole; isActive: boolean; isMe: boolean }

const ROLE_HELP: Record<UserRole, string> = {
  attendant: "Salão, mesas, pedidos e conta. Ideal para garçom e caixa.",
  kitchen: "Só a tela da Cozinha e os pedidos.",
  manager: "Tudo do salão, mais cardápio, relatórios, configurações e equipe.",
  admin: "Acesso total, inclusive criar outros administradores."
};
const ROLE_ORDER: UserRole[] = ["attendant", "kitchen", "manager", "admin"];
const ROLE_TONE: Record<UserRole, string> = {
  attendant: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  kitchen: "bg-[hsl(var(--gema)/0.2)] text-[hsl(var(--warning))]",
  manager: "bg-[hsl(var(--primary-soft))] text-[hsl(var(--primary))]",
  admin: "bg-[hsl(var(--foreground))] text-[hsl(var(--background))]"
};

/** Easy to dictate at the counter: no 0/O or 1/l confusion. */
function makePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (source: string) => source[crypto.getRandomValues(new Uint32Array(1))[0] % source.length];
  return `${Array.from({ length: 4 }, () => pick(letters)).join("")}${Array.from({ length: 4 }, () => pick(digits)).join("")}`;
}

function RolePicker({ value, onChange, allowAdmin }: { value: UserRole; onChange: (role: UserRole) => void; allowAdmin: boolean }): JSX.Element {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ROLE_ORDER.filter((role) => role !== "admin" || allowAdmin).map((role) => (
        <button key={role} type="button" aria-pressed={value === role} onClick={() => onChange(role)} className={cn("rounded-[var(--radius-md)] border p-3 text-left", value === role ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary-soft))]" : "border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))]")}>
          <span className="block font-semibold">{ROLE_LABELS[role]}</span>
          <span className="block text-xs text-[hsl(var(--foreground-muted))]">{ROLE_HELP[role]}</span>
        </button>
      ))}
    </div>
  );
}

export default function EquipePage(): JSX.Element {
  const { user } = useAdminAuth();
  const api = useAdminApi();
  const isAdmin = user?.role === "admin";
  const [team, setTeam] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "attendant" as UserRole });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; password: string | null } | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam((await api<{ team: Member[] }>("/api/admin/staff")).team);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível carregar a equipe.");
      setTeam((current) => current ?? []);
    }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setForm({ name: "", email: "", password: makePassword(), role: "attendant" }); setCreating(true); };

  const submit = async () => {
    setSaving(true);
    try {
      const result = await api<{ passwordKept?: boolean }>("/api/admin/staff", { action: "create", ...form });
      // An e-mail that already had a login keeps its own password (see the staff API).
      setCreated({ name: form.name, email: form.email.trim().toLowerCase(), password: result.passwordKept ? null : form.password });
      setCreating(false);
      await load();
    } catch (failure) {
      appToast.error("Não foi possível cadastrar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const update = async (member: Member, patch: { role?: UserRole; isActive?: boolean }, success: string) => {
    setBusy(member.uid);
    try {
      await api("/api/admin/staff", { action: "update", uid: member.uid, ...patch });
      appToast.success(success);
      await load();
      setEditing((current) => (current && current.uid === member.uid ? { ...current, ...patch } : current));
    } catch (failure) {
      appToast.error("Não foi possível salvar", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const changePassword = async (member: Member) => {
    setBusy(member.uid);
    try {
      await api("/api/admin/staff", { action: "password", uid: member.uid, password: newPassword });
      setCreated({ name: member.name, email: member.email, password: newPassword });
      setEditing(null);
    } catch (failure) {
      appToast.error("Não foi possível trocar a senha", failure instanceof Error ? failure.message : "Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const loginUrl = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;
  const copyAccess = () => {
    if (!created) return;
    const text = `Acesso ao QRápido\nLink: ${loginUrl}\nE-mail: ${created.email}\n${created.password ? `Senha: ${created.password}` : "Senha: a mesma que você já usa (ou use \"Esqueci minha senha\" no login)"}`;
    void navigator.clipboard?.writeText(text).then(() => appToast.success("Dados copiados")).catch(() => appToast.info("Dados de acesso", text));
  };

  const active = (team ?? []).filter((member) => member.isActive);
  const inactive = (team ?? []).filter((member) => !member.isActive);

  const row = (member: Member) => (
    <li key={member.uid}>
      <button type="button" onClick={() => { setEditing(member); setNewPassword(makePassword()); }} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[hsl(var(--surface-muted))]", !member.isActive ? "opacity-60" : "")}>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--surface-muted))] text-sm font-bold">{member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{member.name}{member.isMe ? <span className="font-normal text-[hsl(var(--foreground-muted))]"> (você)</span> : null}</span>
          <span className="block truncate text-sm text-[hsl(var(--foreground-muted))]">{member.email}</span>
        </span>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", ROLE_TONE[member.role])}>{ROLE_LABELS[member.role]}</span>
      </button>
    </li>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-[hsl(var(--foreground-muted))]">Cada pessoa entra com o próprio e-mail e senha e vê só o que a função permite.</p>
        <AppActionButton className="ml-auto gap-2" onClick={openCreate}><Plus className="h-4 w-4" />Adicionar pessoa</AppActionButton>
      </div>
      {error ? <AppSurface className="flex items-center justify-between gap-3 border-[hsl(var(--danger)/0.5)] p-4 text-sm"><p>{error}</p><AppActionButton variant="secondary" className="gap-2" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Tentar de novo</AppActionButton></AppSurface> : null}

      {team === null ? <AppSkeleton className="h-48" /> : team.length === 0 ? (
        <AppEmptyState icon={Users} title="Ninguém na equipe ainda" description="Adicione garçons, caixa e cozinha para cada um ter o próprio acesso." />
      ) : (
        <>
          <AppSurface className="overflow-hidden p-0"><ul className="divide-y divide-[hsl(var(--border))]">{active.map(row)}</ul></AppSurface>
          {inactive.length ? (
            <div className="space-y-2">
              <h2 className="text-base">Sem acesso</h2>
              <AppSurface className="overflow-hidden p-0"><ul className="divide-y divide-[hsl(var(--border))]">{inactive.map(row)}</ul></AppSurface>
            </div>
          ) : null}
        </>
      )}

      {creating ? (
        <AppModal title="Adicionar pessoa à equipe" onClose={() => setCreating(false)} closeOnBackdrop={false}>
          <div className="space-y-4">
            <AppFormField label="Nome"><AppTextInput value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Joana" /></AppFormField>
            <AppFormField label="E-mail (é o login)"><AppTextInput type="email" inputMode="email" autoComplete="off" value={form.email} maxLength={120} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="joana@email.com" /></AppFormField>
            <AppFormField label="Senha inicial" hint="Mínimo 8 caracteres. Você passa para a pessoa junto com o e-mail.">
              <div className="flex gap-2"><AppTextInput className="num" value={form.password} maxLength={64} onChange={(event) => setForm({ ...form, password: event.target.value })} /><AppActionButton variant="secondary" onClick={() => setForm({ ...form, password: makePassword() })} aria-label="Gerar outra senha"><RefreshCw className="h-4 w-4" /></AppActionButton></div>
            </AppFormField>
            <div className="space-y-1.5"><p className="text-sm font-medium">Função</p><RolePicker value={form.role} onChange={(role) => setForm({ ...form, role })} allowAdmin={isAdmin} /></div>
            <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
              <AppActionButton variant="secondary" onClick={() => setCreating(false)}>Cancelar</AppActionButton>
              <AppActionButton disabled={saving || form.name.trim().length < 2 || !form.email.includes("@") || form.password.length < 8} onClick={() => void submit()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Cadastrar</AppActionButton>
            </div>
          </div>
        </AppModal>
      ) : null}

      {created ? (
        <AppModal title={`Acesso de ${created.name}`} onClose={() => setCreated(null)}>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">{created.password ? "Passe estes dados para a pessoa. Por segurança, a senha não aparece de novo depois que você fechar." : "Este e-mail já tinha uma conta, então a senha dele não foi trocada. A pessoa entra com a senha que já usa; se não lembrar, usa \"Esqueci minha senha\" na tela de login."}</p>
          <div className="space-y-1 rounded-[var(--radius-md)] bg-[hsl(var(--surface-muted))] p-4 text-sm">
            <p>Link: <strong className="break-all">{loginUrl}</strong></p>
            <p>E-mail: <strong>{created.email}</strong></p>
            {created.password ? <p>Senha: <strong className="num tracking-wider">{created.password}</strong></p> : null}
          </div>
          <div className="flex justify-end gap-2"><AppActionButton variant="secondary" className="gap-2" onClick={copyAccess}><Copy className="h-4 w-4" />Copiar</AppActionButton><AppActionButton onClick={() => setCreated(null)}>Pronto</AppActionButton></div>
        </AppModal>
      ) : null}

      {editing ? (
        <AppModal title={editing.name} onClose={() => setEditing(null)}>
          <p className="text-sm text-[hsl(var(--foreground-muted))]">{editing.email}</p>
          {editing.isMe ? <p className="rounded-[var(--radius-md)] bg-[hsl(var(--surface-muted))] p-3 text-sm">Este é o seu acesso. Para mudar a sua função, peça a outro administrador.</p> : (
            <>
              <div className="space-y-1.5"><p className="text-sm font-medium">Função</p><RolePicker value={editing.role} allowAdmin={isAdmin} onChange={(role) => { if (role !== editing.role) void update(editing, { role }, `${editing.name} agora é ${ROLE_LABELS[role]}`); }} /></div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Nova senha</p>
                <div className="flex gap-2"><AppTextInput className="num" value={newPassword} maxLength={64} onChange={(event) => setNewPassword(event.target.value)} /><AppActionButton variant="secondary" className="gap-2" disabled={busy === editing.uid || newPassword.length < 8} onClick={() => void changePassword(editing)}><KeyRound className="h-4 w-4" />Trocar</AppActionButton></div>
              </div>
              <div className="flex justify-end border-t border-[hsl(var(--border))] pt-4">
                {editing.isActive
                  ? <AppActionButton variant="destructive" className="gap-2" disabled={busy === editing.uid} onClick={() => void update(editing, { isActive: false }, `${editing.name} ficou sem acesso`)}><UserX className="h-4 w-4" />Tirar o acesso</AppActionButton>
                  : <AppActionButton variant="success" className="gap-2" disabled={busy === editing.uid} onClick={() => void update(editing, { isActive: true }, `${editing.name} voltou a ter acesso`)}><UserCheck className="h-4 w-4" />Devolver o acesso</AppActionButton>}
              </div>
            </>
          )}
        </AppModal>
      ) : null}
    </section>
  );
}
