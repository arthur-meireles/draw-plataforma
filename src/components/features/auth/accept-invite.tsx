"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthHeading, AuthLayout } from "@/components/layout/auth-layout";
import { Badge, Button, Callout, EmptyState, PasswordField, PasswordStrength, Skeleton, TextField } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { MfaEnrollment } from "@/components/domain";
import { authApi, mfaApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";

/** Aceite de convite (RF-M1-02): confirma nome, cria a senha e entra. */
export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const invite = useApiQuery(["invite", token], () => authApi.getInvite(token), { retry: false });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (invite.data) setName(invite.data.name);
  }, [invite.data]);

  /** RN-37: convite de administrador cadastra o 2FA antes da primeira sessão. */
  const [enroll, setEnroll] = useState<string | null>(null);
  const enter = () => {
    qc.clear();
    router.replace("/");
  };
  const accept = useApiMutation((v: { name: string; password: string }) => authApi.acceptInvite(token, v), {
    success: (r) => (r.mfaEnrollChallenge ? "Senha criada. Agora ligue a verificação em duas etapas." : "Conta criada. Bem-vindo à Draw!"),
    onSuccess: (r) => (r.mfaEnrollChallenge ? setEnroll(r.mfaEnrollChallenge) : enter()),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Informe seu nome";
    if (password.length < 8) errs.password = "Use pelo menos 8 caracteres";
    if (confirm !== password) errs.confirm = "A confirmação precisa ser igual à senha";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    accept.mutate({ name, password });
  };

  return (
    <AuthLayout footer="Draw Legal Design · uso interno">
      {enroll ? (
        <div className="space-y-4">
          <AuthHeading title="Cadastre a verificação em duas etapas" description="Administradores só entram com o 2FA ligado." />
          <MfaEnrollment start={() => mfaApi.startEnrollmentForChallenge(enroll)} confirm={(c) => mfaApi.confirmEnrollmentForChallenge(enroll, c)} onDone={enter} doneLabel="Entrar na plataforma" />
        </div>
      ) : invite.isLoading ? (
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : invite.error || !invite.data ? (
        <div className="space-y-4">
          <EmptyState compact icon="lock" title="Convite inválido, expirado ou já utilizado" description={invite.error?.message ?? "O link pode ter sido usado, substituído por um novo ou expirado (vale 7 dias). Peça um novo convite à administração da Draw ou entre, se já tem conta."} />
          <Button asChild variant="primary" size="lg" className="w-full">
            <Link href="/login">Ir para o login</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <AuthHeading title="Aceitar convite" description="Crie sua senha para acessar a plataforma da Draw." />
          <Callout tone="info" icon="invite">
            <span className="block">{invite.data.email}</span>
            <span className="mt-1 flex items-center gap-1.5">
              Perfil: <Badge tone="accent">{ROLE_LABEL[invite.data.role]}</Badge>
            </span>
          </Callout>
          <TextField label="Nome" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <div className="space-y-2">
            <PasswordField label="Senha" required autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="Pelo menos 8 caracteres; misture letras, números e símbolos." />
            <PasswordStrength value={password} />
          </div>
          <PasswordField label="Confirmar senha" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
          <Button type="submit" variant="primary" size="lg" loading={accept.isPending} className="w-full">
            Criar conta e entrar
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
