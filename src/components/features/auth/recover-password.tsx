"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthHeading, AuthLayout } from "@/components/layout/auth-layout";
import { Button, Callout, Icon, PasswordField, PasswordStrength, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { authApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";

function RequestStep() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  /** Só no modo de demonstração: o e-mail não sai de verdade, então mostramos o link que ele levaria. */
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const request = useApiMutation(authApi.requestPasswordReset, {
    success: false,
    onSuccess: (r) => {
      setDemoLink(r.demoLink);
      setSent(true);
    },
    onError: (e) => {
      setError(e.fieldErrors?.email ?? e.message);
      focusFirstInvalid();
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Informe seu e-mail, ex.: nome@draw.com.br");
      return focusFirstInvalid();
    }
    setError(undefined);
    request.mutate(email.trim());
  };

  if (sent)
    return (
      <div className="space-y-4">
        <AuthHeading title="Verifique seu e-mail" />
        <Callout tone="success" icon="emailSent" title="Pedido recebido">
          Se existir uma conta com <strong className="font-medium text-fg">{email.trim()}</strong>, enviamos um link para criar uma nova senha. Ele vale por 1 hora. Confira também a caixa de spam.
        </Callout>
        {demoLink && (
          <Callout tone="neutral" title="Na demonstração">
            Nenhum e-mail sai de verdade.{" "}
            <Link href={demoLink} className="font-medium text-accent hover:underline">
              Abrir o link de redefinição
            </Link>
            .
          </Callout>
        )}
        <Button variant="ghost" className="w-full" onClick={() => setSent(false)}>
          Usar outro e-mail
        </Button>
        <BackToLogin />
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <AuthHeading title="Recuperar senha" description="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha." />
      <TextField label="E-mail" type="email" name="email" autoComplete="email" spellCheck={false} autoFocus value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
      <Button type="submit" variant="primary" size="lg" loading={request.isPending} className="w-full">
        Enviar link de recuperação
      </Button>
      <BackToLogin />
    </form>
  );
}

function BackToLogin() {
  return (
    <p className="text-center text-sm">
      <Link href="/login" className="inline-flex items-center gap-1 text-accent hover:underline">
        <Icon name="arrowLeft" size="sm" />
        Voltar para o login
      </Link>
    </p>
  );
}

function ResetStep({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const reset = useApiMutation((pw: string) => authApi.resetPassword(token, pw), {
    success: false,
    onSuccess: () => setDone(true),
    onError: (e) => {
      if (e.fieldErrors) {
        setErrors(e.fieldErrors);
        focusFirstInvalid();
      } else setFailed(e.message);
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (password.length < 8) errs.password = "Use pelo menos 8 caracteres";
    if (confirm !== password) errs.confirm = "A confirmação precisa ser igual à nova senha";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    reset.mutate(password);
  };

  if (done)
    return (
      <div className="space-y-4">
        <AuthHeading title="Senha alterada" />
        <Callout tone="success" title="Tudo certo">Sua nova senha já vale. Entre com ela para continuar.</Callout>
        <Button variant="primary" size="lg" className="w-full" onClick={() => router.replace("/login")}>
          Ir para o login
        </Button>
      </div>
    );

  if (failed)
    return (
      <div className="space-y-4">
        <AuthHeading title="Link inválido ou expirado" />
        <Callout tone="danger" title={failed}>Cada link vale por 1 hora e só pode ser usado uma vez. Peça um novo link de recuperação para continuar.</Callout>
        <Button variant="primary" size="lg" className="w-full" onClick={() => router.replace("/recuperar-senha")}>
          Pedir novo link
        </Button>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <AuthHeading title="Criar nova senha" description="Escolha uma senha forte que você não usa em outros lugares." />
      <div className="space-y-2">
        <PasswordField label="Nova senha" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="Pelo menos 8 caracteres; misture letras, números e símbolos." />
        <PasswordStrength value={password} />
      </div>
      <PasswordField label="Confirmar nova senha" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
      <Button type="submit" variant="primary" size="lg" loading={reset.isPending} className="w-full">
        Salvar nova senha
      </Button>
      <BackToLogin />
    </form>
  );
}

/** Recuperação de senha (RF-M1-01): pedido (sem revelar se o e-mail existe) e redefinição por `?token=`. */
export function RecoverPassword() {
  const token = useSearchParams().get("token");
  return <AuthLayout footer="Draw Legal Design · uso interno">{token ? <ResetStep token={token} /> : <RequestStep />}</AuthLayout>;
}
