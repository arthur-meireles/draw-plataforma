"use client";
import { useState } from "react";
import { toast } from "sonner";
import { MfaEnrollment, RecoveryCodesList } from "@/components/domain";
import { Badge, Button, Callout, ConfirmDialog, Dialog, ErrorState, PasswordField, PasswordStrength, Section, Skeleton } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { mfaApi, sessionsApi, usersApi } from "@/data/services";
import { dateFull } from "@/lib/format";
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

/** Pede a senha para desligar o 2FA ou gerar novos códigos (RN-37). */
function PasswordConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, run, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel: string; destructive?: boolean; run: (password: string) => Promise<unknown>; onDone: (data: unknown) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const m = useApiMutation(run, { success: false, onSuccess: (d) => (setPassword(""), onDone(d)), onError: (e) => setError(e.fieldErrors?.password ?? e.message) });
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password) return setError("Informe sua senha");
    m.mutate(password);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (setPassword(""), setError(undefined), onOpenChange(o))}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} loading={m.isPending} onClick={() => submit()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <PasswordField label="Sua senha" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
      </form>
    </Dialog>
  );
}

/** Verificação em duas etapas: cadastro (QR + código), códigos de recuperação e desligar (RF-M1-06 / RN-37). */
function MfaBlock() {
  const status = useApiQuery(["me", "mfa"], mfaApi.status);
  const [enrolling, setEnrolling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const s = status.data;

  if (status.isLoading) return <Skeleton className="h-16" />;
  if (status.error || !s) return <ErrorState error={status.error} onRetry={() => status.refetch()} className="py-6" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            Verificação em duas etapas (2FA)
            {s.enabled ? <Badge tone="success" dot>Ligada</Badge> : <Badge tone="neutral">Desligada</Badge>}
          </p>
          <p className="max-w-md text-xs text-fg-subtle">
            {s.enabled ? `Pede um código do aplicativo autenticador a cada entrada${s.enrolledAt ? ` · cadastrada em ${dateFull(s.enrolledAt)}` : ""}. Códigos de recuperação restantes: ${s.recoveryCodesLeft}.` : "Além da senha, pede um código do aplicativo autenticador a cada entrada."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!s.enabled || !s.hasSecret ? (
            <Button variant="primary" size="sm" icon="shield" onClick={() => setEnrolling(true)}>
              {s.enabled ? "Cadastrar aplicativo…" : "Ligar 2FA…"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" icon="key" onClick={() => setRegenerating(true)}>
              Gerar novos códigos…
            </Button>
          )}
          {s.enabled && !s.required && (
            <Button variant="destructive-ghost" size="sm" onClick={() => setDisabling(true)}>
              Desligar…
            </Button>
          )}
        </div>
      </div>
      {s.required && <Callout tone="info" title="Obrigatório para administradores">Seu perfil acessa valores, cofre e configurações, por isso a verificação em duas etapas não pode ser desligada.</Callout>}
      {s.enabled && s.recoveryCodesLeft > 0 && s.recoveryCodesLeft <= 3 && <Callout tone="warning">Restam poucos códigos de recuperação. Gere novos e guarde em lugar seguro.</Callout>}

      <Dialog open={enrolling} onOpenChange={setEnrolling} size="lg" title="Ligar verificação em duas etapas" description="Use um aplicativo autenticador no celular.">
        {enrolling && <MfaEnrollment start={mfaApi.startEnrollment} confirm={mfaApi.confirmEnrollment} onDone={() => setEnrolling(false)} onCancel={() => setEnrolling(false)} />}
      </Dialog>
      <PasswordConfirmDialog open={disabling} onOpenChange={setDisabling} title="Desligar a verificação em duas etapas?" description="Sua conta volta a pedir só a senha. Os códigos de recuperação deixam de valer." confirmLabel="Desligar 2FA" destructive run={mfaApi.disable} onDone={() => (setDisabling(false), toast.success("Verificação em duas etapas desligada"))} />
      <PasswordConfirmDialog open={regenerating} onOpenChange={setRegenerating} title="Gerar novos códigos de recuperação?" description="Os códigos anteriores deixam de valer na hora." confirmLabel="Gerar códigos" run={mfaApi.regenerateRecoveryCodes} onDone={(d) => (setRegenerating(false), setCodes((d as { recoveryCodes: string[] }).recoveryCodes))} />
      <Dialog open={!!codes} onOpenChange={(o) => !o && setCodes(null)} title="Novos códigos de recuperação" description="Cada código entra uma única vez. Eles não aparecem de novo." footer={<Button variant="primary" onClick={() => setCodes(null)}>Guardei os códigos</Button>}>
        {codes && <RecoveryCodesList codes={codes} />}
      </Dialog>
    </div>
  );
}

/** RN-75 — "Encerrar outras sessões": derruba os outros navegadores/aparelhos e mantém este. */
function SessionsBlock() {
  const [open, setOpen] = useState(false);
  const revoke = useApiMutation(() => sessionsApi.revokeOthers(), { success: "Outras sessões encerradas", onSuccess: () => setOpen(false), onError: () => setOpen(false) });
  return (
    <div className="border-t border-line pt-5">
      <h3 className="mb-1 text-sm font-semibold text-fg">Sessões abertas</h3>
      <p className="mb-3 max-w-md text-xs text-fg-subtle">Perdeu um aparelho ou entrou num computador emprestado? Encerre as outras sessões — esta continua. A sessão também expira sozinha depois de 8 horas sem uso.</p>
      <Button variant="outline" size="sm" icon="logout" onClick={() => setOpen(true)}>
        Encerrar outras sessões…
      </Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Encerrar as outras sessões?" description="Todos os outros aparelhos e navegadores onde você está conectado(a) precisam entrar de novo. Esta sessão continua." confirmLabel="Encerrar outras sessões" onConfirm={() => revoke.mutate(undefined)} loading={revoke.isPending} />
    </div>
  );
}

/** Segurança da conta: 2FA (obrigatório para admin — RF-M1-06/RN-37) e troca de senha. */
export function SecuritySection() {
  return (
    <Section title="Segurança" description="Proteja o acesso à sua conta" icon="shield">
      <div className="space-y-6">
        <MfaBlock />
        <div className="border-t border-line pt-5">
          <h3 className="mb-3 text-sm font-semibold text-fg">Alterar senha</h3>
          <ChangePasswordForm />
        </div>
        <SessionsBlock />
      </div>
    </Section>
  );
}
