"use client";
import { Badge, DataTable, Section, type Column } from "@/components/ui";
import type { EmailLog, EmailStatus } from "@/data/types";
import { dateTime } from "@/lib/format";

const PROVIDER: Record<EmailLog["provider"], string> = { brevo: "Brevo", resend: "Resend", draw_smtp: "SMTP da Draw" };
const STATUS: Record<EmailStatus, { label: string; tone: "neutral" | "info" | "success" | "danger" | "warning" }> = {
  queued: { label: "Na fila", tone: "neutral" },
  sent: { label: "Enviado", tone: "info" },
  delivered: { label: "Entregue", tone: "success" },
  bounced: { label: "Devolvido", tone: "danger" },
  complained: { label: "Marcado como spam", tone: "warning" },
  failed: { label: "Falhou", tone: "danger" },
};

/** Últimos e-mails do sistema (RNF-13: provedor, status, data). */
export function RecentSystemEmails({ rows, isLoading, error, onRetry }: { rows: EmailLog[] | undefined; isLoading?: boolean; error?: { message?: string; status?: number } | null; onRetry?: () => void }) {
  const columns: Column<EmailLog>[] = [
    { id: "subject", header: "Assunto", mobile: "title", cell: (l) => <span className="font-medium text-fg">{l.subject}</span> },
    { id: "to", header: "Para", mobile: "subtitle", cell: (l) => <span className="text-fg-muted">{l.to.join(", ")}</span> },
    { id: "provider", header: "Provedor", hideBelow: "md", cell: (l) => <span className="text-fg-muted">{PROVIDER[l.provider]}</span> },
    { id: "status", header: "Status", mobile: "trailing", cell: (l) => <Badge tone={STATUS[l.status].tone} dot>{STATUS[l.status].label}</Badge> },
    { id: "at", header: "Enviado em", hideBelow: "lg", cell: (l) => <span className="whitespace-nowrap text-fg-subtle">{dateTime(l.sentAt)}</span> },
  ];
  return (
    <Section title="E-mails recentes do sistema" description="Convites, recuperação de senha, pedidos de NF e testes" icon="emailSent" bodyClassName="p-0">
      <DataTable rows={rows} columns={columns} getRowId={(l) => l.id} isLoading={isLoading} error={error} onRetry={onRetry} pageSize={8} empty={{ icon: "email", title: "Nenhum e-mail enviado ainda", description: "Convites e notificações enviados pela plataforma aparecem aqui.", compact: true }} />
    </Section>
  );
}
