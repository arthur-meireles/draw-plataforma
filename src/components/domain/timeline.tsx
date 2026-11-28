"use client";
/** Linha do tempo de eventos (RF-X-02) e conversa de comentários com menções. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar, Badge, Button, EmptyState, ErrorState, Icon, RowActions, Skeleton, Textarea, useEntrance, useSuccessFlash, type IconName } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { commentsApi, eventsApi } from "@/data/services";
import { APPROVAL_DECISION_LABEL, PAYABLE_STATUS_LABEL, projectStage, quoteStage, taskStatus } from "@/data/reference";
import type { ID, ProjectStageKey, QuoteStageKey, TaskStatusKey } from "@/data/types";
import { dateFull, dateTime, money, relative } from "@/lib/format";
import { usePermissions } from "@/components/layout/session";
import { cn } from "@/lib/cn";

type EventRow = Awaited<ReturnType<typeof eventsApi.list>>[number];

const FIELD_LABEL: Record<string, string> = { contractedAmountCents: "valor contratado", amountCents: "valor", agreedAmountCents: "valor acordado" };

/** Frase humana para cada tipo de evento. */
export function describeEvent(e: EventRow): { icon: IconName; text: React.ReactNode } {
  const d = e.data as Record<string, unknown>;
  const b = (s: React.ReactNode) => <strong className="font-medium text-fg">{s}</strong>;
  switch (e.type) {
    case "project.created":
      return { icon: "add", text: <>criou o projeto {d.origin === "direto" ? "direto" : "em cotação"}</> };
    case "project.direct_created":
      return { icon: "project", text: <>criou como projeto direto com {b(money(d.contractedAmountCents as number))}</> };
    case "project.stage_changed":
      return { icon: "arrowRight", text: <>moveu de {b(projectStage(d.from as ProjectStageKey)?.label ?? "—")} para {b(projectStage(d.to as ProjectStageKey)?.label ?? "—")}</> };
    case "project.quote_stage_changed":
      return { icon: "arrowRight", text: <>moveu a cotação de {b(quoteStage(d.from as QuoteStageKey)?.label ?? "—")} para {b(quoteStage(d.to as QuoteStageKey)?.label ?? "—")}</> };
    case "project.updated":
      return { icon: "edit", text: <>editou {(d.fields as string[])?.length ?? 0} campo(s) do projeto</> };
    case "project.value_changed":
    case "proposal.value_changed":
    case "receivable.value_changed":
    case "project_member.value_changed":
      if (d.field === "expectedAt") return { icon: "due", text: <>alterou o vencimento de {b(d.before ? dateFull(String(d.before)) : "—")} para {b(dateFull(String(d.after)))}</> };
      return { icon: "money", text: <>alterou {FIELD_LABEL[d.field as string] ?? d.field as string} de {b(money(d.before as number))} para {b(money(d.after as number))}</> };
    case "project.completed":
      return { icon: "stageDone", text: <>concluiu o projeto{d.payablesCreated ? <> e gerou {b(`${d.payablesCreated} pedido(s) de NF`)}</> : null}</> };
    case "project.archived":
      return { icon: "archive", text: <>arquivou o projeto</> };
    case "project.unarchived":
      return { icon: "unarchive", text: <>desarquivou o projeto</> };
    case "project.lost":
      return { icon: "stageLost", text: <>marcou a cotação como perdida: {b(String(d.reason ?? ""))}</> };
    case "project.reopened":
      return { icon: "restore", text: d.kind === "concluido" ? <>reabriu o projeto concluído: {b(String(d.reason ?? ""))}</> : <>reabriu a cotação</> };
    case "project.reactivated":
      return { icon: "restore", text: <>reativou o projeto cancelado: {b(String(d.reason ?? ""))}{d.receivablesRestored ? <> ({String(d.receivablesRestored)} recebível(is) de volta a previsto)</> : null}</> };
    case "proposal.approval_undone":
      return { icon: "undo", text: <>desfez a aprovação da proposta {b(`v${d.version}`)} — voltou para cotação: {b(String(d.reason ?? ""))}</> };
    case "project.cancelled":
      return { icon: "stageLost", text: <>cancelou o projeto: {b(String(d.reason ?? ""))}</> };
    case "project.paused":
      return { icon: "pause", text: <>pausou o projeto: {b(String(d.reason ?? ""))}</> };
    case "project.resumed":
      return { icon: "resume", text: <>retomou o projeto</> };
    case "project.member_added":
      return { icon: "invite", text: <>adicionou um membro à equipe</> };
    case "project.owner_changed":
      return { icon: "user", text: <>trocou o responsável do projeto (o anterior segue na equipe como apoio)</> };
    case "project.member_removed":
      return { icon: "team", text: <>removeu um membro da equipe</> };
    case "project.tasks_generated":
      return { icon: "task", text: <>gerou {b(`${d.count} tarefas`)} do modelo do tipo de projeto</> };
    case "proposal.created":
      return { icon: "proposal", text: <>criou a proposta {b(`v${d.version}`)} de {b(money(d.amountCents as number))}</> };
    case "proposal.sent":
      return { icon: "send", text: <>enviou a proposta {b(`v${d.version}`)} ({money(d.amountCents as number)})</> };
    case "proposal.approved":
      return { icon: "approval", text: <>aprovou a proposta {b(`v${d.version}`)} — projeto ativo</> };
    case "proposal.rejected":
      return { icon: "close", text: <>registrou recusa da proposta {b(`v${d.version}`)}{d.reason ? <>: {String(d.reason)}</> : null}</> };
    case "proposal.discarded":
      return { icon: "delete", text: <>descartou o rascunho da proposta {b(`v${d.version}`)}</> };
    case "task.created":
      return { icon: "task", text: <>criou a tarefa {b(String(d.title))}</> };
    case "task.status_changed":
      return { icon: "task", text: <>mudou {b(String(d.title))} para {b(taskStatus(d.to as TaskStatusKey)?.label ?? "")}</> };
    case "task.assigned":
      return { icon: "user", text: <>atribuiu a tarefa {b(String(d.title))}</> };
    case "task.due_changed":
      return { icon: "due", text: <>alterou o prazo de {b(String(d.title))}</> };
    case "task.deleted":
      return { icon: "delete", text: <>excluiu a tarefa {b(String(d.title))}</> };
    case "comment.created":
      return { icon: "comment", text: <>comentou: &ldquo;{String(d.excerpt ?? "")}&rdquo;</> };
    case "approval.requested":
      return { icon: "approval", text: <>pediu aprovação a {b(String(d.requestedFrom))}</> };
    case "approval.withdrawn":
      return { icon: "approval", text: <>{d.byUser ? "retirou um pedido de aprovação" : "retirou o pedido de aprovação sem resposta (a etapa mudou)"}</> };
    case "approval.decided":
      return { icon: "approval", text: <>registrou aprovação: {b(APPROVAL_DECISION_LABEL[d.decision as keyof typeof APPROVAL_DECISION_LABEL])}{d.reason ? <> — {String(d.reason)}</> : null}</> };
    case "file.uploaded":
      return { icon: "upload", text: <>enviou {b(String(d.name))}</> };
    case "file.version_added":
      return { icon: "upload", text: <>enviou a versão {b(`v${d.version}`)} de {b(String(d.name))}</> };
    case "file.released":
      return { icon: "share", text: <>liberou {b(String(d.name))} para freelancers</> };
    case "file.deleted":
      return { icon: "delete", text: <>excluiu {b(String(d.name))}</> };
    case "receivable.invoiced":
      return { icon: "invoice", text: <>emitiu a NF {b(String(d.invoiceNumber))} de {money(d.amountCents as number)}</> };
    case "receivable.received":
      return { icon: "receivable", text: <>deu baixa no recebimento de {b(money(d.amountCents as number))}</> };
    case "receivable.additional_created":
      return { icon: "receivable", text: <>lançou a cobrança adicional {b(String(d.description ?? ""))} de {b(money(d.amountCents as number))}</> };
    case "receivable.collection_note":
      return { icon: "comment", text: <>atualizou a nota de cobrança</> };
    case "receivable.delivery_due":
      return { icon: "receivable", text: <>trouxe {b(`${d.count} parcela(s) "na entrega"`)} para vencer hoje na conclusão</> };
    case "receivable.delivery_rescheduled":
      return { icon: "receivable", text: <>recalculou {b(`${d.count} vencimento(s)`)} após mudar o prazo do projeto</> };
    case "receivable.cancelled":
      return { icon: "close", text: <>cancelou o lançamento a receber</> };
    case "receivable.collection_sent":
      return { icon: "send", text: <>registrou cobrança enviada ao cliente{d.to ? <> ({b(String(d.to))})</> : null}{d.note ? <>: {String(d.note)}</> : null}</> };
    case "receivable.invoice_cancelled":
      return { icon: "close", text: <>cancelou a NF{(d.previous as { invoiceNumber?: string } | undefined)?.invoiceNumber ? <> {b(String((d.previous as { invoiceNumber?: string }).invoiceNumber))}</> : null}: {b(String(d.reason ?? ""))}</> };
    case "receivable.receipt_reversed":
      return { icon: "undo", text: <>estornou a baixa de {b(money(d.amountCents as number))}: {b(String(d.reason ?? ""))}</> };
    case "receivable.overdue_alerted":
      return { icon: "warning", text: <>sistema avisou o Financeiro e o responsável do vencimento</> };
    case "receivable.due_soon_alerted":
      return { icon: "due", text: <>sistema avisou o Financeiro de que o vencimento está próximo</> };
    case "payable.invoice_reminder_sent":
      return { icon: "send", text: <>sistema lembrou o freelancer de enviar a NF{d.emailed ? " (e-mail)" : ""}</> };
    case "payable.approval_reversed":
      return { icon: "undo", text: <>desfez a aprovação: {b(String(d.reason ?? ""))}</> };
    case "payable.payment_reversed":
      return { icon: "undo", text: <>estornou o pagamento de {b(money(d.amountCents as number))}: {b(String(d.reason ?? ""))}</> };
    case "payable.link_resent":
      return { icon: "send", text: <>reenviou o link de envio da NF ao freelancer</> };
    case "payable.created":
      return { icon: "payable", text: <>gerou conta a pagar de {b(money((d.agreedAmountCents ?? d.amountCents) as number))}</> };
    case "payable.invoice_submitted":
      return { icon: "invoice", text: <>freelancer enviou NF de {b(money(d.amountCents as number))}{d.divergent ? <span className="text-danger"> — divergente</span> : null}</> };
    case "payable.approved":
      return { icon: "approval", text: <>aprovou a NF para pagamento ({PAYABLE_STATUS_LABEL.aprovado})</> };
    case "payable.paid":
      return { icon: "payment", text: <>registrou pagamento de {b(money(d.amountCents as number))}</> };
    case "payable.divergent":
      return { icon: "warning", text: <>marcou NF como divergente</> };
    case "payable.invoice_registered":
      return { icon: "invoice", text: <>registrou manualmente a NF {b(String(d.invoiceNumber ?? ""))} de {b(money(d.amountCents as number))}{d.divergent ? <span className="text-danger"> — divergente</span> : null}{d.note ? <> — {String(d.note)}</> : null}</> };
    case "payable.invoice_rejected":
      return { icon: "warning", text: <>recusou a NF{(d.previous as { invoiceNumber?: string } | undefined)?.invoiceNumber ? <> {b(String((d.previous as { invoiceNumber?: string }).invoiceNumber))}</> : null} e pediu uma nova: {b(String(d.reason ?? ""))}</> };
    case "project.member_payment_waived":
      return { icon: "team", text: <>marcou um freelancer como {b("sem pagamento")} na conclusão</> };
    case "project.imported":
      return { icon: "upload", text: <>importou o projeto da planilha master ({b(String(d.legacyCode ?? ""))})</> };
    case "project.import_updated":
      return { icon: "upload", text: <>atualizou o projeto pela planilha master ({b(String(d.legacyCode ?? ""))})</> };
    default:
      return { icon: "history", text: <>{e.type}</> };
  }
}

/** Linha do tempo de eventos; com `projectId` mostra o histórico do projeto. */
export function EventTimeline({ projectId, entityType, entityId, clientId, limit, showProject, compact }: { projectId?: ID; entityType?: string; entityId?: ID; clientId?: ID; limit?: number; showProject?: boolean; compact?: boolean }) {
  const q = useApiQuery(["events", projectId, entityType, entityId, clientId, limit], () => eventsApi.list({ projectId, entityType, entityId, clientId, limit }));
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading)
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  if (!q.data?.length) return <EmptyState compact icon="history" title="Sem histórico ainda" description="Toda mudança relevante aparece aqui, com quem e quando." />;
  return (
    <ol className="relative space-y-0">
      {q.data.map((e, i) => {
        const { icon, text } = describeEvent(e);
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < q.data.length - 1 && <span aria-hidden className="absolute left-[11px] top-7 bottom-0 w-px bg-line" />}
            <span className="relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg-subtle">
              <Icon name={icon} size="xs" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5 text-xs leading-relaxed text-fg-muted">
              <span className="font-medium text-fg">{e.actorName}</span> {text}
              {showProject && e.projectCode && (
                <>
                  {" "}em{" "}
                  <Link href={`/projetos/${e.projectCode}`} className="font-mono text-accent hover:underline">
                    {e.projectCode}
                  </Link>
                </>
              )}
              <time dateTime={e.occurredAt} title={dateTime(e.occurredAt)} className={compact ? "ml-1.5 text-fg-subtle" : "block text-2xs text-fg-subtle"}>
                {relative(e.occurredAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Renderiza @menções destacadas. */
function CommentBody({ body }: { body: string }) {
  const parts = body.split(/(@[A-ZÀ-Úa-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+)?)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-fg-muted">
      {parts.map((p, i) => (p.startsWith("@") ? <span key={i} className="rounded-xs bg-accent-subtle px-0.5 font-medium text-accent">{p}</span> : p))}
    </p>
  );
}

/** Conversa do projeto ou da tarefa, com @menções (notifica). Ctrl/⌘+Enter envia. */
export function CommentThread({ projectId, taskId, placeholder = "Escreva um comentário… use @ para mencionar" }: { projectId: ID; taskId?: ID | null; placeholder?: string }) {
  const { user } = usePermissions();
  const q = useApiQuery(["comments", projectId, taskId], () => commentsApi.list(projectId, taskId === undefined ? undefined : taskId));
  // RN-54 — sugestões = responsável e equipe do projeto (inclusive freelancers); a menção guarda o id escolhido.
  const people = useApiQuery(["comments", "mentionables", projectId], () => commentsApi.mentionables(projectId), { staleTime: 30_000 });
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<{ id: ID; label: string }[]>([]);
  const [error, setError] = useState<string>();
  const mentionQuery = useMemo(() => /@([\wÀ-ú]*)$/.exec(body)?.[1] ?? null, [body]);
  const suggestions = mentionQuery !== null ? (people.data ?? []).filter((p) => p.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5) : [];
  const pick = (p: { id: ID; name: string }) => {
    setBody(body.replace(/@([\wÀ-ú]*)$/, `@${p.name} `));
    setPicked((l) => (l.some((x) => x.id === p.id) ? l : [...l, { id: p.id, label: p.name }]));
  };

  const sent = useSuccessFlash();
  const enter = useEntrance();
  const create = useApiMutation(commentsApi.create, { onSuccess: () => {
      setBody("");
      setPicked([]);
      sent.flash();
    }, onError: (e) => setError(e.fieldErrors?.body ?? e.message) });
  const remove = useApiMutation(commentsApi.remove, { success: "Comentário excluído" });

  const submit = () => {
    if (!body.trim()) {
      setError("Escreva algo antes de enviar");
      return;
    }
    setError(undefined);
    // só as menções escolhidas na lista que continuam no texto
    const mentions = picked.filter((p) => body.includes(`@${p.label}`)).map((p) => p.id);
    create.mutate({ projectId, taskId: taskId ?? null, body, mentions });
  };

  return (
    <div className="space-y-4">
      {q.isLoading && (
        <div className="space-y-3" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-16 flex-1 rounded-xl" />
            </div>
          ))}
        </div>
      )}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && !q.data.length && <p className="text-sm text-fg-subtle">Nenhum comentário ainda. Comece a conversa abaixo.</p>}
      <ul className="space-y-3">
        {q.data?.map((c) => (
          <li key={c.id} {...enter(c.id)} className={cn("flex gap-3", enter(c.id).className)}>
            <Avatar name={c.authorName} color={c.authorColor} size="lg" />
            <div className="min-w-0 flex-1 rounded-xl border border-line bg-layer-2 px-3 py-2 shadow-raised">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="text-sm font-medium text-fg">{c.authorName}</span>
                {c.external && <Badge tone="violet" size="xs">Cliente via link</Badge>}
                <time className="text-2xs text-fg-subtle" title={dateTime(c.createdAt)}>
                  {relative(c.createdAt)}
                </time>
                {c.taskTitle && taskId === undefined && <span className="truncate text-2xs text-fg-subtle">em {c.taskTitle}</span>}
                <span className="flex-1" />
                {(c.authorId === user.id || user.role === "admin") && <RowActions items={[{ label: "Excluir comentário", icon: "delete", destructive: true, onSelect: () => remove.mutate(c.id) }]} />}
              </div>
              <CommentBody body={c.body} />
            </div>
          </li>
        ))}
      </ul>
      <div className="relative flex gap-3">
        <Avatar name={user.name} color={user.avatarColor} size="lg" />
        <div className="relative min-w-0 flex-1">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder}
            rows={2}
            invalid={!!error}
            aria-label="Novo comentário"
            onSubmitShortcut={submit}
            className="min-h-16 pr-24"
          />
          {suggestions.length > 0 && (
            <ul role="listbox" className="absolute bottom-full left-0 z-20 mb-1 w-64 rounded-lg border border-line bg-layer-2 p-1 shadow-overlay">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-layer-hover">
                    <Avatar name={p.name} color={p.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-left">{p.name}</span>
                    {p.kind === "freelancer" && <span className="text-2xs text-fg-subtle">Freelancer</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="absolute bottom-2 right-2">
            <Button size="sm" variant="primary" icon="send" loading={create.isPending} success={sent.success} successLabel="Enviado" onClick={submit}>
              Enviar
            </Button>
          </div>
          {error && <p className="mt-1 text-xs text-danger" aria-live="polite">{error}</p>}
        </div>
      </div>
    </div>
  );
}
