"use client";
/** Detalhe da notificação, com contexto do projeto e atalho para o item relacionado. */
import Link from "next/link";
import { Badge, Button, DescriptionList, Icon, IconButton, Section, Skeleton } from "@/components/ui";
import { ProjectCode, ProjectStageLabel, ProjectStatusBadge, QuoteStageLabel } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { notificationsApi, projectsApi } from "@/data/services";
import { dateTime, dateFull } from "@/lib/format";
import type { InboxNotification } from "./inbox-item";
import { notificationMeta } from "./notification-meta";

/** Para onde o botão principal leva, conforme o tipo e a entidade da notificação. */
export function targetOf(n: InboxNotification, isFreelancer: boolean): { href: string; label: string } | null {
  if (n.type === "nf_solicitada" && isFreelancer) return { href: "/", label: "Enviar nota fiscal" };
  if (n.type === "nf_solicitada" || n.type === "nf_recebida") return { href: n.entityType === "payable" && n.entityId ? `/financeiro/pagar?aberto=${n.entityId}` : "/financeiro/pagar", label: "Abrir contas a pagar" };
  // RN-34 — avisos da rotina de prazos
  if (n.entityType === "document") return { href: "/adm/documentos", label: "Abrir documentos" };
  if (n.entityType === "receivable" && n.entityId) return { href: `/financeiro/receber?aberto=${n.entityId}`, label: "Abrir recebimento" };
  if (n.entityType === "task" && n.entityId && !n.projectCode) return { href: `/adm/tarefas?tarefa=${n.entityId}`, label: "Abrir tarefa" };
  if (!n.projectCode) return null;
  if (n.entityType === "task" && n.entityId) return { href: `/projetos/${n.projectCode}?aba=tarefas&tarefa=${n.entityId}`, label: "Abrir tarefa" };
  if (n.entityType === "comment") return { href: `/projetos/${n.projectCode}?aba=comentarios`, label: "Abrir conversa" };
  if (n.entityType === "approval" || n.type === "aprovacao") return { href: `/projetos/${n.projectCode}?aba=aprovacoes`, label: "Ver aprovações" };
  if (n.entityType === "proposal") return { href: `/projetos/${n.projectCode}?aba=visao-geral`, label: "Ver propostas" };
  return { href: `/projetos/${n.projectCode}`, label: "Abrir projeto" };
}

export function InboxDetail({ item: n, onBack, onClose }: { item: InboxNotification; onBack: () => void; onClose: () => void }) {
  const project = useApiQuery(["project", n.projectId], () => projectsApi.get(n.projectId!), { enabled: !!n.projectId, retry: false });
  const markRead = useApiMutation((read: boolean) => notificationsApi.markRead(n.id, read), { success: false });
  const archive = useApiMutation(() => notificationsApi.archive(n.id), { success: "Notificação arquivada", onSuccess: onClose });
  const { isFreelancer } = usePermissions();
  const meta = notificationMeta[n.type];
  const target = targetOf(n, isFreelancer);
  const p = project.data;

  return (
    <article className="flex min-h-0 flex-1 flex-col" aria-label="Detalhe da notificação">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-3 md:px-4">
        <IconButton icon="arrowLeft" label="Voltar para a lista" onClick={onBack} className="md:hidden" />
        <Badge tone="accent" icon={meta.icon}>
          {meta.label}
        </Badge>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" icon={n.readAt ? "inbox" : "check"} onClick={() => markRead.mutate(!n.readAt)} loading={markRead.isPending}>
          {n.readAt ? "Marcar como não lida" : "Marcar como lida"}
        </Button>
        <Button size="sm" variant="ghost" icon="archive" onClick={() => archive.mutate(undefined)} loading={archive.isPending}>
          Arquivar
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin md:p-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-fg max-md:text-md">{n.title}</h2>
          <p className="text-xs text-fg-subtle">{dateTime(n.createdAt)}</p>
        </div>
        {n.body && <p className="whitespace-pre-wrap text-base text-fg-muted">{n.body}</p>}
        {target && (
          <Button asChild variant="primary" iconRight="arrowRight">
            <Link href={target.href}>{target.label}</Link>
          </Button>
        )}
        {n.projectId && (
          <Section title="Contexto" icon="project">
            {project.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-16" />
              </div>
            ) : !p ? (
              <p className="text-sm text-fg-subtle">Você não tem acesso ao projeto relacionado ou ele foi removido.</p>
            ) : (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-medium text-fg">
                  <ProjectCode code={p.code} />
                  <Link href={`/projetos/${p.code}`} className="truncate hover:text-accent">
                    {p.title}
                  </Link>
                </p>
                <DescriptionList
                  columns={2}
                  items={[
                    { label: "Cliente", value: p.clientName },
                    { label: "Tipo", value: p.typeName },
                    { label: "Situação", value: <ProjectStatusBadge status={p.status} /> },
                    { label: "Etapa", value: p.status === "cotacao" ? <QuoteStageLabel stageKey={p.quoteStageKey} /> : <ProjectStageLabel stageKey={p.projectStageKey} /> },
                    { label: "Prazo", value: p.dueAt ? <span className="inline-flex items-center gap-1"><Icon name="due" size="xs" />{dateFull(p.dueAt)}</span> : "—" },
                    { label: "Responsável", value: p.owner?.name ?? "—" },
                  ]}
                />
              </div>
            )}
          </Section>
        )}
      </div>
    </article>
  );
}
