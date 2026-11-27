"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthHeading, AuthLayout } from "@/components/layout/auth-layout";
import { Button, Icon, PasswordField, TextField, showSplash } from "@/components/ui";
import { MfaEnrollment } from "@/components/domain";
import { ApiError, authApi, mfaApi } from "@/data/services";
import { isDemoMode } from "@/lib/demo";

/** Atalhos de demonstração: visíveis em desenvolvimento ou com NEXT_PUBLIC_DEMO_LOGIN=1. */
const SHOW_DEMO = isDemoMode();

/** Só aceita voltar para rota interna (evita redirecionar para outro site). */
const safeNext = (next: string | null) => (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/");

const DEMO = [
  { email: "paula@draw.com.br", label: "Paula · Admin" },
  { email: "beatriz@draw.com.br", label: "Beatriz · Gestão" },
  { email: "carlos@draw.com.br", label: "Carlos · Comercial" },
  { email: "fernanda@draw.com.br", label: "Fernanda · Financeiro" },
  { email: "lucas@draw.com.br", label: "Lucas · Operação" },
  { email: "julia.martins@gmail.com", label: "Júlia · Freelancer" },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** Desafio pré-2FA (RN-30): sem sessão até o código ser confirmado. */
  const [mfa, setMfa] = useState<string | null>(null);
  /** RN-37: administrador sem 2FA cadastra antes de entrar (desafio de cadastro). */
  const [enroll, setEnroll] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const finish = () => {
    qc.clear();
    showSplash();
    router.replace(safeNext(params.get("next")));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Informe seu e-mail, ex.: nome@draw.com.br";
    if (!password) errs.password = "Informe sua senha";
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(errs.email ? "login-email" : "login-password")?.focus();
      return;
    }
    setLoading(true);
    try {
      const r = await authApi.login(email, password);
      if (r.mfaRequired && r.mfaEnroll) setEnroll(r.mfaChallenge);
      else if (r.mfaRequired) {
        setCode("");
        setRecovery(false);
        setFieldErrors({});
        setMfa(r.mfaChallenge);
      }
      else finish();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoading(false);
    }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfa) return;
    setLoading(true);
    try {
      await authApi.verifyMfa(mfa, code);
      finish();
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.status === 401) {
        // desafio expirou: volta ao e-mail e senha
        setMfa(null);
        setError(apiErr.message);
      } else setFieldErrors({ code: apiErr.message });
    } finally {
      setLoading(false);
    }
  };

  if (enroll) {
    return (
      <div className="space-y-4">
        <AuthHeading title="Cadastre a verificação em duas etapas" description="Administradores só entram com o 2FA ligado. Leva menos de um minuto." />
        <MfaEnrollment
          start={() => mfaApi.startEnrollmentForChallenge(enroll)}
          confirm={(c) => mfaApi.confirmEnrollmentForChallenge(enroll, c)}
          onDone={finish}
          doneLabel="Entrar na plataforma"
          cancelLabel="Voltar"
          onCancel={() => {
            void mfaApi.cancelEnrollmentChallenge(enroll);
            setEnroll(null);
            setPassword("");
          }}
        />
      </div>
    );
  }

  if (mfa) {
    return (
      <form onSubmit={submitMfa} noValidate className="space-y-4">
        <AuthHeading title="Verificação em duas etapas" description={recovery ? "Digite um dos códigos de recuperação que você guardou (ex.: 4f2a-9c1b). Cada código vale uma vez." : "Digite o código de 6 números do seu aplicativo autenticador."} />
        {recovery ? (
          <TextField key="rec" label="Código de recuperação" id="mfa" autoComplete="off" spellCheck={false} maxLength={9} autoFocus value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} error={fieldErrors.code} />
        ) : (
          <TextField key="totp" label="Código" id="mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={fieldErrors.code} hint={SHOW_DEMO ? "Na demonstração, qualquer sequência de 6 números funciona." : undefined} />
        )}
        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          Verificar e entrar
        </Button>
        <Button variant="link" size="sm" className="w-full justify-center" onClick={() => (setRecovery((v) => !v), setCode(""), setFieldErrors({}))}>
          {recovery ? "Usar o código do aplicativo" : "Perdeu o celular? Use um código de recuperação"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => {
            void authApi.cancelMfa(mfa);
            setMfa(null);
            setPassword("");
          }}
        >
          Voltar
        </Button>
      </form>
    );
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-4">
        <AuthHeading title="Entrar na plataforma" description="Use o e-mail cadastrado pela Draw." />
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">
            <Icon name="warning" size="sm" className="mt-0.5" />
            {error}
          </div>
        )}
        <TextField id="login-email" label="E-mail" type="email" name="email" autoComplete="email" spellCheck={false} autoFocus value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />
        <PasswordField id="login-password" label="Senha" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
        <div className="flex justify-end">
          <Link href="/recuperar-senha" className="text-xs text-accent hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
          Entrar
        </Button>
      </form>
      {SHOW_DEMO && (
      <div className="mt-6 border-t border-line pt-4">
        <p className="mb-2 text-xs font-medium text-fg-subtle">Acesso de demonstração (senha: draw123)</p>
        <div className="flex flex-wrap gap-1.5">
          {DEMO.map((d) => (
            <Button
              key={d.email}
              variant="outline"
              size="xs"
              className="max-md:h-9"
              onClick={() => {
                setEmail(d.email);
                setPassword("draw123");
              }}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthLayout footer="Draw Legal Design · uso interno">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
