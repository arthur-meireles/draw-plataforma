"use client";
/**
 * Cadastro da verificação em duas etapas (RN-37) — usado no login (admin obrigado), no aceite de convite de
 * administrador e em Minha conta › Segurança. Passos: QR + chave manual → código do aplicativo → códigos de
 * recuperação (mostrados uma única vez).
 */
import { useEffect, useRef, useState } from "react";
import { Button, Callout, Checkbox, CopyButton, ErrorState, Icon, Reveal, Skeleton, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { isDemoMode } from "@/lib/demo";

export interface MfaSetup {
  secret: string;
  otpauthUrl: string;
  account: string;
}

/** Lugar do QR: no back-end o servidor devolve a imagem; aqui mostramos a chave para digitar no aplicativo. */
function QrPlaceholder({ account }: { account: string }) {
  return (
    <div className="flex size-36 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-layer p-3 text-center">
      <Icon name="authenticator" size="lg" className="text-fg-subtle" />
      <span className="text-2xs leading-tight text-fg-subtle">Código QR de {account}</span>
    </div>
  );
}

/** Lista de códigos de recuperação com copiar tudo. */
export function RecoveryCodesList({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-2 gap-1.5 rounded-lg border border-line bg-layer p-3 font-mono text-sm text-fg" aria-label="Códigos de recuperação">
        {codes.map((c) => (
          <li key={c} className="tabular-nums">
            {c}
          </li>
        ))}
      </ol>
      <CopyButton value={codes.join("\n")} label="Copiar códigos" successMessage="Códigos copiados. Guarde em um lugar seguro." />
    </div>
  );
}

export function MfaEnrollment({
  start,
  confirm,
  onDone,
  doneLabel = "Concluir",
  onCancel,
  cancelLabel = "Cancelar",
}: {
  start: () => Promise<MfaSetup>;
  confirm: (code: string) => Promise<{ recoveryCodes: string[] }>;
  onDone: () => void;
  doneLabel?: string;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const setup = useApiMutation((_: void) => start(), { success: false });
  const verify = useApiMutation((c: string) => confirm(c), {
    success: "Verificação em duas etapas ligada",
    onError: (e) => setError(e.fieldErrors?.code ?? e.message),
  });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setup.mutate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (verify.data) {
    return (
      <Reveal key="codes" className="space-y-4">
        <Callout tone="success" icon="shield" title="Pronto, sua conta está protegida">
          Guarde estes códigos de recuperação. Cada um entra uma única vez se você perder o celular. Eles não aparecem de novo.
        </Callout>
        <RecoveryCodesList codes={verify.data.recoveryCodes} />
        <Checkbox checked={saved} onCheckedChange={setSaved} label="Guardei os códigos em um lugar seguro" />
        <Button variant="primary" className="w-full" onClick={() => (saved ? onDone() : setError("Confirme que guardou os códigos"))}>
          {doneLabel}
        </Button>
        {error && !saved && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </Reveal>
    );
  }

  if (setup.error) return <ErrorState error={setup.error} onRetry={() => setup.mutate()} />;
  if (!setup.data)
    return (
      <div className="space-y-3" aria-busy>
        <div className="flex gap-4">
          <Skeleton className="size-36" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8" />
          </div>
        </div>
        <Skeleton className="h-10" />
      </div>
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Digite os 6 números que aparecem no aplicativo");
      document.getElementById("mfa-enroll-code")?.focus();
      return;
    }
    setError(undefined);
    verify.mutate(code);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <ol className="space-y-1 text-sm text-fg-muted">
        <li>1. Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>2. Leia o código QR ou digite a chave abaixo.</li>
        <li>3. Digite o código de 6 números que o aplicativo mostrar.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-4">
        <QrPlaceholder account={setup.data.account} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-medium text-fg-muted">Chave para digitar no aplicativo</p>
          <p className="break-all rounded-md border border-line bg-layer px-2.5 py-2 font-mono text-sm text-fg">{setup.data.secret}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={setup.data.secret.replace(/\s/g, "")} label="Copiar chave" />
            <CopyButton value={setup.data.otpauthUrl} label="Copiar link otpauth" />
          </div>
        </div>
      </div>
      <TextField
        id="mfa-enroll-code"
        label="Código do aplicativo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        error={error}
        hint={isDemoMode() ? "Na demonstração, qualquer sequência de 6 números funciona." : undefined}
      />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" variant="primary" loading={verify.isPending}>
          Confirmar e ligar
        </Button>
      </div>
    </form>
  );
}
