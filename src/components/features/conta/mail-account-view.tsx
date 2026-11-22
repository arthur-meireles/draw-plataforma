"use client";
import { useState } from "react";
import { Badge, Button, Callout, ConfirmDialog, ErrorState, Icon, PageBody, PageHeader, Section, Skeleton, type Tone } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { mailApi } from "@/data/services";
import type { MailAccount } from "@/data/types";
import { dateTime, relative } from "@/lib/format";
import { GoogleConnectDialog } from "./google-connect-dialog";
import { SignatureEditor } from "./signature-editor";
import { SmtpConnectDialog } from "./smtp-connect-dialog";

const STATUS: Record<MailAccount["status"], { label: string; tone: Tone }> = {
  connected: { label: "Conectada", tone: "success" },
  error: { label: "Com erro", tone: "danger" },
  expired: { label: "Expirada", tone: "warning" },
};

function ConnectedCard({ account }: { account: MailAccount }) {
  const [confirm, setConfirm] = useState(false);
  const test = useApiMutation(mailApi.testMyAccount, { success: "Conexão funcionando" });
  const disconnect = useApiMutation(mailApi.disconnect, { success: "Caixa desconectada e credenciais apagadas", onSuccess: () => setConfirm(false) });
  const s = STATUS[account.status];
  return (
    <Section
      title="Caixa conectada"
      icon="email"
      actions={
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-layer text-fg-muted">
            <Icon name={account.kind === "gmail_oauth" ? "emailSent" : "server"} size="lg" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{account.address}</p>
            <p className="text-xs text-fg-subtle">
              {account.kind === "gmail_oauth" ? "Google (OAuth, somente envio)" : `SMTP · ${account.smtpHost}:${account.smtpPort}`}
              {account.lastCheckedAt && <> · verificada {relative(account.lastCheckedAt)}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" icon="refresh" loading={test.isPending} onClick={() => test.mutate(undefined)}>
              Testar conexão
            </Button>
            <Button variant="destructive-ghost" icon="close" onClick={() => setConfirm(true)}>
              Desconectar…
            </Button>
          </div>
        </div>
        {account.status !== "connected" && <Callout tone="warning" title="A conexão precisa de atenção">Teste a conexão ou desconecte e conecte de novo. Enquanto isso, o envio de e-mails pelos projetos fica indisponível.</Callout>}
        {account.lastCheckedAt && <p className="text-xs text-fg-subtle">Última verificação: {dateTime(account.lastCheckedAt)}</p>}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Desconectar a caixa de e-mail?"
        description="As credenciais guardadas (token ou senha de app) são apagadas na hora. Você não poderá enviar e-mails pelos projetos até conectar de novo. O histórico de e-mails dos projetos é mantido."
        confirmLabel="Desconectar caixa"
        destructive
        loading={disconnect.isPending}
        onConfirm={() => disconnect.mutate(undefined)}
      />
    </Section>
  );
}

function ConnectOptions() {
  const [google, setGoogle] = useState(false);
  const [smtp, setSmtp] = useState(false);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Conectar com Google" description="Recomendado para quem usa Gmail ou Google Workspace" icon="emailSent" className="flex flex-col" bodyClassName="flex flex-1 flex-col gap-4">
          <ul className="flex-1 space-y-1.5 text-sm text-fg-muted">
            <li className="flex gap-2"><Icon name="check" size="sm" className="mt-0.5 text-success" />Sem senha na plataforma: você autoriza pelo Google.</li>
            <li className="flex gap-2"><Icon name="check" size="sm" className="mt-0.5 text-success" />Escopo só de envio; não lemos sua caixa.</li>
            <li className="flex gap-2"><Icon name="check" size="sm" className="mt-0.5 text-success" />App interno ao domínio da Draw.</li>
          </ul>
          <div>
            <Button variant="primary" icon="link" onClick={() => setGoogle(true)}>
              Conectar com Google
            </Button>
          </div>
        </Section>
        <Section title="SMTP genérico" description="Para outros provedores (Outlook, hospedagem de e-mail)" icon="server" className="flex flex-col" bodyClassName="flex flex-1 flex-col gap-4">
          <ul className="flex-1 space-y-1.5 text-sm text-fg-muted">
            <li className="flex gap-2"><Icon name="info" size="sm" className="mt-0.5 text-info" />Informe servidor, porta, usuário e senha de app.</li>
            <li className="flex gap-2"><Icon name="info" size="sm" className="mt-0.5 text-info" />No Microsoft 365, o SMTP básico costuma estar desligado; fale com a administração.</li>
          </ul>
          <div>
            <Button variant="outline" icon="server" onClick={() => setSmtp(true)}>
              Conectar por SMTP
            </Button>
          </div>
        </Section>
      </div>
      <GoogleConnectDialog open={google} onOpenChange={setGoogle} />
      <SmtpConnectDialog open={smtp} onOpenChange={setSmtp} />
    </>
  );
}

/** Minha conta → E-mail: conectar caixa, status, teste, desconectar e assinatura (RF-M11-02/04/06/07). */
export function MailAccountView() {
  const q = useApiQuery(["mail", "mine"], mailApi.myAccount);
  return (
    <>
      <PageHeader crumbs={[{ label: "Minha conta", icon: "account" }, { label: "E-mail" }]} />
      <PageBody width="content">
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading || !q.data ? (
          <div className="space-y-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-64" />
          </div>
        ) : !q.data.canUse ? (
          <Callout tone="info" icon="email" title="Freelancers não conectam caixa de e-mail">
            Você continua recebendo e-mails da plataforma (convites, pedidos de nota fiscal e avisos). O envio de e-mails pelos projetos é feito pela equipe da Draw.
          </Callout>
        ) : (
          <div className="space-y-5">
            {q.data.account ? (
              <ConnectedCard account={q.data.account} />
            ) : (
              <>
                <Callout tone="warning" title="Nenhuma caixa conectada">
                  Sem uma caixa conectada, a ação “Enviar e-mail” fica indisponível nos projetos. A plataforma nunca envia pelo e-mail do sistema em nome de uma pessoa.
                </Callout>
                <ConnectOptions />
              </>
            )}
            <SignatureEditor />
          </div>
        )}
      </PageBody>
    </>
  );
}
