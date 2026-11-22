"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, DataTable, Icon, Sheet, Skeleton, type Column, type Tone } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiQuery } from "@/data/hooks";
import { mailApi } from "@/data/services";
import type { EmailStatus } from "@/data/types";
import { dateTime, relative } from "@/lib/format";
import { EmailComposer } from "./email-composer";
import type { ProjectDetail } from "./use-project";

type Mail = Awaited<ReturnType<typeof mailApi.projectEmails>>[number];

const STATUS: Record<EmailStatus, { label: string; tone: Tone }> = {
  queued: { label: "Na fila", tone: "neutral" },
  sent: { label: "Enviado", tone: "info" },
  delivered: { label: "Entregue", tone: "success" },
  bounced: { label: "Devolvido", tone: "danger" },
  complained: { label: "Marcado como spam", tone: "danger" },
  failed: { label: "Falhou", tone: "danger" },
};

/** Converte o HTML guardado em texto simples para exibição segura. */
function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function MailSheet({ mail, onClose }: { mail: Mail | null; onClose: () => void }) {
  return (
    <Sheet open={!!mail} onOpenChange={(o) => !o && onClose()} width="md" ariaTitle="E-mail enviado" title={mail ? <span className="truncate">{mail.log.subject}</span> : "E-mail"}>
      {mail && (
        <div className="space-y-5 px-5 py-5 md:px-6">
          <dl className="space-y-1.5 text-sm">
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-xs text-fg-subtle">De</dt><dd className="text-fg">{mail.senderName}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-xs text-fg-subtle">Para</dt><dd className="min-w-0 break-words text-fg">{mail.log.to.join(", ")}</dd></div>
            {mail.log.cc.length > 0 && <div className="flex gap-2"><dt className="w-16 shrink-0 text-xs text-fg-subtle">Cc</dt><dd className="min-w-0 break-words text-fg">{mail.log.cc.join(", ")}</dd></div>}
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-xs text-fg-subtle">Data</dt><dd className="text-fg">{dateTime(mail.log.sentAt)}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 text-xs text-fg-subtle">Status</dt><dd><Badge tone={STATUS[mail.log.status].tone} dot>{STATUS[mail.log.status].label}</Badge></dd></div>
          </dl>
          <p className="whitespace-pre-wrap break-words rounded-lg border border-line bg-layer p-4 text-sm leading-relaxed text-fg-muted">{htmlToText(mail.bodyHtml)}</p>
          {mail.attachmentsInfo.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-fg">Anexos</h3>
              <ul className="space-y-1.5">
                {mail.attachmentsInfo.map((a) => (
                  <li key={a.versionId} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm">
                    <Icon name="attach" size="sm" className="text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <Badge>v{a.version}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Aba "E-mails" (M11): histórico do projeto e composição pela caixa do usuário (RF-M11-03/05/07). */
export function ProjectEmails({ project }: { project: ProjectDetail }) {
  const { canWrite } = usePermissions();
  const account = useApiQuery(["mail-account"], mailApi.myAccount, { staleTime: 30_000 });
  const emails = useApiQuery(["project-emails", project.id], () => mailApi.projectEmails(project.id));
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<Mail | null>(null);
  const connected = account.data?.account?.status === "connected";
  const allowed = canWrite("mail") && account.data?.canUse !== false;

  const columns: Column<Mail>[] = [
    { id: "subject", header: "Assunto", mobile: "title", sortValue: (m) => m.log.subject, cell: (m) => <span className="font-medium text-fg">{m.log.subject}</span> },
    { id: "sender", header: "Remetente", mobile: "subtitle", hideBelow: "md", sortValue: (m) => m.senderName, cell: (m) => <span className="text-fg-muted">{m.senderName}</span> },
    { id: "to", header: "Destinatários", mobile: "meta", hideBelow: "lg", cell: (m) => <span className="block max-w-56 truncate text-fg-muted" title={m.log.to.join(", ")}>{m.log.to.join(", ")}</span> },
    { id: "attachments", header: "Anexos", mobile: "meta", hideBelow: "md", sortValue: (m) => m.attachmentsInfo.length, cell: (m) => (m.attachmentsInfo.length ? <span className="inline-flex items-center gap-1 text-fg-muted"><Icon name="attach" size="xs" />{m.attachmentsInfo.map((a) => `${a.name} v${a.version}`).join(", ").slice(0, 40)}{m.attachmentsInfo.length > 1 ? ` (+${m.attachmentsInfo.length - 1})` : ""}</span> : <span className="text-fg-placeholder">—</span>) },
    { id: "date", header: "Data", mobile: "meta", sortValue: (m) => m.log.sentAt ?? "", cell: (m) => <span className="text-fg-muted" title={dateTime(m.log.sentAt)}>{relative(m.log.sentAt)}</span> },
    { id: "status", header: "Status", mobile: "meta", sortValue: (m) => m.log.status, cell: (m) => <Badge tone={STATUS[m.log.status].tone} dot>{STATUS[m.log.status].label}</Badge> },
  ];

  return (
    <div>
      {allowed && account.isSuccess && !connected && (
        <div role="status" className="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3 text-sm">
          <Icon name="warning" size="md" className="text-warning" />
          <p className="min-w-0 flex-1 text-fg-muted">
            <span className="font-medium text-fg">Conecte sua caixa de e-mail para enviar por aqui.</span> A plataforma nunca envia em seu nome pelo e-mail do sistema.
          </p>
          <Button asChild size="sm" variant="primary"><Link href="/minha-conta/email">Conectar minha caixa</Link></Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <p className="text-xs text-fg-subtle">{emails.data ? `${emails.data.length} ${emails.data.length === 1 ? "e-mail" : "e-mails"} no histórico` : ""}</p>
        {allowed && (
          <Button size="sm" variant="primary" icon="email" disabled={!connected} onClick={() => setComposing(true)} title={connected ? undefined : "Conecte sua caixa de e-mail em Minha conta para enviar"}>
            Escrever e-mail
          </Button>
        )}
      </div>
      {account.isLoading && !emails.data ? (
        <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : (
        <DataTable
          rows={emails.data}
          columns={columns}
          getRowId={(m) => m.id}
          isLoading={emails.isLoading}
          error={emails.error}
          onRetry={() => emails.refetch()}
          onRowClick={setOpen}
          initialSort={{ id: "date", dir: "desc" }}
          empty={{ icon: "email", title: "Nenhum e-mail enviado por este projeto", description: connected ? "Envie propostas, entregas e pedidos de aprovação sem sair daqui. Tudo fica registrado." : "Conecte sua caixa de e-mail para enviar propostas, entregas e pedidos de aprovação daqui.", action: allowed ? (connected ? { label: "Escrever e-mail", icon: "email", onClick: () => setComposing(true) } : { label: "Conectar minha caixa", href: "/minha-conta/email" }) : undefined }}
        />
      )}
      {composing && <EmailComposer project={project} onClose={() => setComposing(false)} />}
      <MailSheet mail={open} onClose={() => setOpen(null)} />
    </div>
  );
}
