"use client";
import { Suspense, useEffect, useState } from "react";
import { AccessGate } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Button, Callout, ErrorState, Icon, PageBody, PageHeader, PasswordField, RadioGroup, SegmentedControl, Section, Skeleton, TextField } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { mailApi } from "@/data/services";
import type { SystemMailSettings } from "@/data/types";
import { focusFirstInvalid } from "@/lib/focus";
import { MailUsage } from "./mail-usage";
import { RecentSystemEmails } from "./recent-system-emails";
import { TestEmailDialog } from "./test-email-dialog";

type Transport = SystemMailSettings["transport"];

function DnsInfo() {
  const rows = [
    { name: "SPF", text: "Um registro TXT no domínio da Draw com os dois include: o do Brevo e o do Resend." },
    { name: "DKIM", text: "Cada provedor fornece uma chave. Publique as duas no DNS e confirme no painel de cada um." },
    { name: "DMARC", text: "Registro TXT _dmarc com política inicial p=none; endureça depois de acompanhar os relatórios." },
  ];
  return (
    <Section title="Autenticação do domínio" description="Garante que os e-mails da Draw cheguem à caixa de entrada (RNF-13)" icon="shield">
      <dl className="grid gap-3 md:grid-cols-3">
        {rows.map((r) => (
          <div key={r.name} className="rounded-lg border border-line bg-layer p-3">
            <dt className="text-sm font-semibold text-fg">{r.name}</dt>
            <dd className="mt-1 text-sm text-fg-muted">{r.text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-fg-subtle">
        <Icon name="info" size="sm" className="mt-px" />
        O remetente é fixo no domínio da Draw. Devoluções (bounce) e reclamações de spam dos dois provedores aparecem em “E-mails recentes”.
      </p>
    </Section>
  );
}

function Content() {
  const p = usePermissions();
  const canEdit = p.canWriteAll("settings");
  const q = useApiQuery(["mail", "system"], mailApi.systemSettings);
  const [transport, setTransport] = useState<Transport>("brevo_resend");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [security, setSecurity] = useState<"starttls" | "ssl">("starttls");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [test, setTest] = useState(false);

  const s = q.data?.settings;
  useEffect(() => {
    if (!s) return;
    setTransport(s.transport);
    setHost(s.smtpHost ?? "");
    setPort(String(s.smtpPort ?? 587));
    setSecurity(s.smtpSecurity ?? "starttls");
    setUser(s.smtpUser ?? "");
    setPassword("");
    setFromName(s.fromName);
    setFromAddress(s.fromAddress);
  }, [s]);

  const save = useApiMutation(mailApi.saveSystemSettings, {
    success: "Configuração de e-mail salva",
    onSuccess: () => setErrors({}),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (transport === "draw_smtp") {
      if (!host.trim()) errs.smtpHost = "Informe o servidor SMTP, ex.: smtp.draw.com.br";
      if (!port || Number(port) < 1 || Number(port) > 65535) errs.smtpPort = "Informe a porta (ex.: 587)";
      if (!user.trim()) errs.smtpUser = "Informe o usuário";
      if (!s?.smtpPasswordSet && !password) errs.smtpPassword = "Informe a senha";
    }
    if (!fromName.trim()) errs.fromName = "Informe o nome do remetente";
    if (!/^\S+@\S+\.\S+$/.test(fromAddress.trim())) errs.fromAddress = "Informe um remetente válido, ex.: nao-responda@draw.com.br";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    save.mutate({ transport, smtpHost: host.trim() || null, smtpPort: Number(port) || null, smtpSecurity: security, smtpUser: user.trim() || null, fromName: fromName.trim(), fromAddress: fromAddress.trim(), smtpPassword: password || undefined });
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Configurações", icon: "settings", href: "/configuracoes/usuarios" }, { label: "E-mail do sistema" }]}
        actions={
          canEdit && (
            <Button size="sm" variant="outline" icon="send" onClick={() => setTest(true)}>
              <span className="max-sm:hidden">Enviar e-mail de teste</span>
              <span className="sm:hidden">Testar</span>
            </Button>
          )
        }
      />
      <PageBody width="content">
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <div className="space-y-5">
            {!canEdit && <Callout tone="neutral" icon="lock" title="Somente leitura">Só administradores alteram o e-mail do sistema.</Callout>}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <form onSubmit={submit} noValidate className="space-y-5">
                {q.isLoading ? (
                  <Skeleton className="h-96" />
                ) : (
                  <fieldset disabled={!canEdit || save.isPending} className="min-w-0 space-y-5">
                    <Section title="Transporte" description="Por onde a plataforma envia convites, recuperação de senha e notificações" icon="server">
                      <RadioGroup
                        value={transport}
                        onChange={setTransport}
                        options={[
                          { value: "brevo_resend", label: "Brevo + Resend (padrão, planos gratuitos)", description: "Brevo envia primeiro; o Resend assume se a cota acabar ou houver falha." },
                          { value: "draw_smtp", label: "SMTP próprio da Draw", description: "O servidor da Draw vira o transporte principal; Brevo e Resend ficam de reserva." },
                        ]}
                      />
                      {transport === "draw_smtp" && (
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <TextField label="Servidor (host)" required value={host} onChange={(e) => setHost(e.target.value)} error={errors.smtpHost} placeholder="smtp.draw.com.br" autoComplete="off" />
                          <TextField label="Porta" required inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} error={errors.smtpPort} />
                          <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium text-fg-muted">Segurança</span>
                            <SegmentedControl aria-label="Segurança da conexão" value={security} onChange={setSecurity} options={[{ value: "starttls", label: "STARTTLS" }, { value: "ssl", label: "SSL/TLS" }]} className="self-start" />
                          </div>
                          <TextField label="Usuário" required value={user} onChange={(e) => setUser(e.target.value)} error={errors.smtpUser} autoComplete="off" />
                          <PasswordField label="Senha" required={!s?.smtpPasswordSet} value={password} onChange={(e) => setPassword(e.target.value)} error={errors.smtpPassword} autoComplete="new-password" placeholder={s?.smtpPasswordSet ? "••••••••" : ""} hint={s?.smtpPasswordSet ? "Senha definida. Preencha só para trocar; ela nunca é exibida." : "Guardada cifrada; nunca é exibida depois de salva."} containerClassName="sm:col-span-2" />
                        </div>
                      )}
                    </Section>
                    <Section title="Remetente" description="Fixo no domínio da Draw" icon="email">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField label="Nome" required value={fromName} onChange={(e) => setFromName(e.target.value)} error={errors.fromName} />
                        <TextField label="E-mail" required type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} error={errors.fromAddress} />
                      </div>
                    </Section>
                    {canEdit && (
                      <div className="flex justify-end">
                        <Button type="submit" variant="primary" loading={save.isPending}>
                          Salvar configuração
                        </Button>
                      </div>
                    )}
                  </fieldset>
                )}
              </form>
              <MailUsage usage={q.data?.usage} isLoading={q.isLoading} />
            </div>
            <RecentSystemEmails rows={q.data?.recent} isLoading={q.isLoading} />
            <DnsInfo />
          </div>
        )}
      </PageBody>
      <TestEmailDialog open={test} onOpenChange={setTest} />
    </>
  );
}

export function EmailSettingsView() {
  return (
    <AccessGate resource="settings">
      <Suspense>
        <Content />
      </Suspense>
    </AccessGate>
  );
}
