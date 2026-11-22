"use client";
import { useState } from "react";
import { usePermissions } from "@/components/layout/session";
import { Button, Callout, PasswordField, PasswordStrength, Section, Switch } from "@/components/ui";
import { useApiMutation, useMe } from "@/data/hooks";
import { usersApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = useApiMutation((v: { current: string; next: string }) => usersApi.changePassword(v.current, v.next), {
    success: "Senha alterada",
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      setErrors({});
    },
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!current) errs.current = "Informe a senha atual";
    if (next.length < 8) errs.next = "Use pelo menos 8 caracteres";
    if (confirm !== next) errs.confirm = "A confirmação precisa ser igual à nova senha";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    change.mutate({ current, next });
  };
  return (
    <form onSubmit={submit} noValidate className="grid max-w-md gap-4">
      <PasswordField label="Senha atual" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} />
      <div className="space-y-2">
        <PasswordField label="Nova senha" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.next} hint="Pelo menos 8 caracteres; misture letras, números e símbolos." />
        <PasswordStrength value={next} />
      </div>
      <PasswordField label="Confirmar nova senha" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      <div>
        <Button type="submit" variant="primary" loading={change.isPending}>
          Alterar senha
        </Button>
      </div>
    </form>
  );
}

/** Segurança da conta: 2FA (obrigatório para admin — RF-M1-06) e troca de senha. */
export function SecuritySection() {
  const { isAdmin } = usePermissions();
  const me = useMe();
  const mfa = useApiMutation(usersApi.setMfa, { success: (_d) => (me.data?.mfaEnabled ? "Verificação em duas etapas desligada" : "Verificação em duas etapas ligada") });
  const enabled = isAdmin ? true : !!me.data?.mfaEnabled;
  return (
    <Section title="Segurança" description="Proteja o acesso à sua conta" icon="shield">
      <div className="space-y-6">
        <div className="space-y-3">
          <Switch label="Verificação em duas etapas (2FA)" description="Além da senha, pede um código do aplicativo autenticador a cada entrada." checked={enabled} disabled={isAdmin || mfa.isPending || me.isLoading} onCheckedChange={(v) => mfa.mutate(v)} />
          {isAdmin && <Callout tone="info" title="Obrigatório para administradores">Seu perfil acessa valores, cofre e configurações, por isso a verificação em duas etapas não pode ser desligada.</Callout>}
        </div>
        <div className="border-t border-line pt-5">
          <h3 className="mb-3 text-sm font-semibold text-fg">Alterar senha</h3>
          <ChangePasswordForm />
        </div>
      </div>
    </Section>
  );
}
