"use client";
/** Visão em lista do funil (padrão no celular). */
import { useRouter } from "next/navigation";
import { Avatar, DataTable, RowActions, type Column } from "@/components/ui";
import { Money, ProjectCode, ProjectTypeIcon, QuoteStageLabel } from "@/components/domain";
import { useApiMutation } from "@/data/hooks";
import { projectsApi, type QuoteItem } from "@/data/services";
import { dateFull } from "@/lib/format";
import { StalledChip } from "./stalled-chip";

export function QuoteList({ items, isLoading, error, onRetry, canMove, hasFilters, onClear }: { items: QuoteItem[] | undefined; isLoading?: boolean; error?: { message?: string; status?: number } | null; onRetry?: () => void; canMove: boolean; hasFilters: boolean; onClear: () => void }) {
  const router = useRouter();
  const reopen = useApiMutation((id: string) => projectsApi.reopenQuote(id), { success: "Cotação reaberta em Negociação" });

  const columns: Column<QuoteItem>[] = [
    { id: "code", header: "Código", cell: (q) => <ProjectCode code={q.code} />, sortValue: (q) => q.code, mobile: "hidden", width: "6rem" },
    {
      id: "title",
      header: "Cotação",
      mobile: "title",
      sortValue: (q) => q.title,
      cell: (q) => (
        <span className="block min-w-0">
          <span className="block max-w-80 truncate font-medium text-fg max-md:max-w-none max-md:whitespace-normal">{q.title}</span>
          <span className="block text-xs text-fg-subtle md:hidden">
            {q.code} · {q.clientName}
          </span>
        </span>
      ),
    },
    { id: "client", header: "Cliente", cell: (q) => <span className="text-fg-muted">{q.clientName}</span>, sortValue: (q) => q.clientName, mobile: "hidden", hideBelow: "md" },
    {
      id: "type",
      header: "Tipo",
      hideBelow: "lg",
      mobile: "hidden",
      sortValue: (q) => q.typeName,
      cell: (q) => (
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <ProjectTypeIcon icon={q.typeIcon} size="xs" />
          {q.typeName}
        </span>
      ),
    },
    {
      id: "owner",
      header: "Responsável",
      hideBelow: "lg",
      mobile: "meta",
      sortValue: (q) => q.ownerName,
      cell: (q) => (
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <Avatar name={q.ownerName} color={q.ownerColor} size="xs" />
          {q.ownerName.split(" ")[0]}
        </span>
      ),
    },
    { id: "stage", header: "Etapa", cell: (q) => <QuoteStageLabel stageKey={q.column} />, sortValue: (q) => q.column, mobile: "subtitle" },
    {
      id: "amount",
      header: "Última proposta",
      align: "right",
      mobile: "trailing",
      sortValue: (q) => q.proposalAmountCents,
      cell: (q) => (
        <span className="inline-flex flex-col items-end">
          <Money cents={q.proposalAmountCents} className="font-medium text-fg" />
          {q.proposalVersion != null && <span className="text-2xs text-fg-subtle">v{q.proposalVersion}</span>}
        </span>
      ),
    },
    { id: "sent", header: "Enviada em", hideBelow: "xl", mobile: "hidden", sortValue: (q) => q.quoteSentAt, cell: (q) => <span className="text-fg-muted">{q.quoteSentAt ? dateFull(q.quoteSentAt) : "—"}</span> },
    {
      id: "stalled",
      header: "Dias parados",
      align: "right",
      hideBelow: "md",
      sortValue: (q) => (q.status === "cotacao" ? q.stalledDays : -1),
      cell: (q) => (q.status === "cotacao" ? <StalledChip days={q.stalledDays} /> : <span className="text-fg-placeholder">—</span>),
      mobile: "meta",
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      width: "2.5rem",
      mobile: "hidden",
      cell: (q) => (
        <RowActions
          items={[
            { label: "Abrir cotação", icon: "externalLink", onSelect: () => router.push(`/projetos/${q.code}`) },
            { label: "Reabrir cotação", icon: "restore", hidden: !canMove || q.status !== "perdido", onSelect: () => reopen.mutate(q.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable
      rows={items}
      columns={columns}
      getRowId={(q) => q.id}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      rowHref={(q) => `/projetos/${q.code}`}
      initialSort={{ id: "stalled", dir: "desc" }}
      empty={
        hasFilters
          ? { icon: "filter", title: "Nenhuma cotação com esses filtros", description: "Ajuste ou limpe os filtros para ver o funil completo.", action: { label: "Limpar filtros", onClick: onClear } }
          : { icon: "commercial", title: "Nenhuma cotação em andamento", description: "Crie a primeira cotação para começar o funil.", action: canMove ? { label: "Nova cotação", href: "/projetos/novo?origem=cotacao", icon: "add" } : undefined }
      }
    />
  );
}
