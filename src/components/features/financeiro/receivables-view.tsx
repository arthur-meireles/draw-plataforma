"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Money, ProjectCode, ReceivableKindBadge, ReceivableStatusBadge } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Button, ClearFiltersButton, DataTable, Fab, FilterChip, FilterSelectChip, MonthFilterChip, PageBody, PageHeader, SearchInput, StatusChips, Toolbar, type Column } from "@/components/ui";
import { useApiQuery, useClientOptions, useOrganization } from "@/data/hooks";
import { RECEIVABLE_STATUS_LABEL } from "@/data/reference";
import { financeApi, projectsApi } from "@/data/services";
import type { ReceivableStatus } from "@/data/types";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { dateFull, money, formatCnpj } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { NewReceivableDialog } from "./new-receivable-dialog";
import { ReceivableSheet } from "./receivable-sheet";
import { SummaryStrip, TotalsRow } from "./totals-row";
import type { ReceivableRow } from "./types";

const STATUSES: ReceivableStatus[] = ["previsto", "faturado", "vencido", "recebido", "cancelado"];

const columns: Column<ReceivableRow>[] = [
  { id: "due", header: "Vencimento", sortValue: (r) => r.expectedAt, mobile: "subtitle", cell: (r) => <span className={r.status === "vencido" ? "text-danger" : "text-fg-muted"}>{dateFull(r.expectedAt)}</span> },
  {
    id: "project",
    header: "Projeto",
    sortValue: (r) => r.projectCode,
    mobile: "title",
    cell: (r) => (
      <Link href={`/projetos/${r.projectCode}?aba=financeiro`} onClick={(e) => e.stopPropagation()} className="inline-flex items-baseline gap-2 hover:underline">
        <ProjectCode code={r.projectCode} />
        <span className="hidden max-md:inline">{r.description}</span>
      </Link>
    ),
  },
  { id: "client", header: "Cliente", hideBelow: "lg", sortValue: (r) => r.clientName, mobile: "meta", cell: (r) => <span className="text-fg-muted">{r.clientName}</span> },
  { id: "desc", header: "Descrição", hideBelow: "md", sortValue: (r) => r.description, mobile: "hidden", cell: (r) => (
      <span className="flex items-center gap-1.5">
        <span className="line-clamp-1 max-w-72">{r.description}</span>
        <ReceivableKindBadge kind={r.kind} />
      </span>
    ),
  },
  { id: "note", header: "Cobrança", hideBelow: "xl", mobile: "hidden", cell: (r) => <span className="line-clamp-1 max-w-56 text-fg-muted" title={r.collectionNote ?? undefined}>{r.collectionNote ?? "—"}</span> },
  { id: "amount", header: "Valor", align: "right", sortValue: (r) => r.amountCents, mobile: "trailing", cell: (r) => <Money cents={r.amountCents} className="font-medium" /> },
  { id: "tax", header: "Impostos", align: "right", hideBelow: "xl", sortValue: (r) => r.taxCents, mobile: "hidden", cell: (r) => <Money cents={r.taxCents} className="text-fg-muted" /> },
  { id: "nf", header: "NF nº", hideBelow: "lg", sortValue: (r) => r.invoiceNumber ?? "", mobile: "hidden", cell: (r) => <span className="text-fg-muted">{r.invoiceNumber ?? "—"}</span> },
  { id: "status", header: "Status", sortValue: (r) => r.status, mobile: "meta", cell: (r) => <ReceivableStatusBadge status={r.status} /> },
];

export function ReceivablesView() {
  const { canWriteAll, money: canMoney } = usePermissions();
  const [f, set, activeCount] = useUrlState({ status: "todos", cliente: undefined as string | undefined, mes: undefined as string | undefined, projeto: undefined as string | undefined, vence: undefined as string | undefined, q: "", aberto: undefined as string | undefined });
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const clients = useClientOptions();
  const projects = useApiQuery(["projects", "options"], () => projectsApi.list());
  const project = projects.data?.find((p) => p.id === f.projeto || p.code === f.projeto?.toUpperCase());
  const projectId = project?.id ?? f.projeto;

  const q = useApiQuery(["finance", "receivables", f.cliente, f.mes, projectId, f.q], () => financeApi.receivables({ clientId: f.cliente, month: f.mes, projectId, q: f.q }));
  const all = q.data;
  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: all?.length ?? 0 };
    for (const s of STATUSES) c[s] = all?.filter((r) => r.status === s).length ?? 0;
    return c;
  }, [all]);
  // RN-92 — "Vence em N dias" (janela de alerta da organização): previstos e faturados que ainda não venceram
  const org = useOrganization();
  const soonDays = org.data?.org.settings.dueSoonDays ?? 7;
  const rows = useMemo(() => {
    const base = f.status === "todos" ? all?.filter((r) => r.status !== "cancelado") : all?.filter((r) => r.status === f.status);
    if (!f.vence) return base;
    const now = Date.now();
    const end = now + soonDays * 86_400_000;
    return base?.filter((r) => (r.status === "previsto" || r.status === "faturado") && new Date(r.expectedAt).getTime() >= now - 86_400_000 && new Date(r.expectedAt).getTime() <= end);
  }, [all, f.status, f.vence, soonDays]);
  const open = all?.find((r) => r.id === f.aberto) ?? null;

  const totals = rows?.reduce((a, r) => ({ amount: a.amount + r.amountCents, tax: a.tax + r.taxCents }), { amount: 0, tax: 0 });
  const statusOptions = [{ value: "todos", label: "Todos", count: all ? counts.todos - counts.cancelado : undefined }, ...STATUSES.map((s) => ({ value: s, label: RECEIVABLE_STATUS_LABEL[s], count: all ? counts[s] : undefined }))];

  const exportCsv = () => {
    const chosen = (rows ?? []).filter((r) => selected.includes(r.id));
    const csv = toCsv(
      ["Vencimento", "Projeto", "Cliente", "CNPJ", "Descrição", "Valor", "Impostos", "NF nº", "Status", "Tipo", "Cobrança"],
      chosen.map((r) => [dateFull(r.expectedAt), r.projectCode, r.clientName, formatCnpj(r.clientCnpj), r.description, (r.amountCents / 100).toFixed(2).replace(".", ","), (r.taxCents / 100).toFixed(2).replace(".", ","), r.invoiceNumber, RECEIVABLE_STATUS_LABEL[r.status], r.kind === "adicional" ? "Adicional" : "Parcela", r.collectionNote]),
    );
    downloadTextFile(`contas-a-receber-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`${chosen.length} lançamento(s) exportado(s) em CSV.`);
  };

  const clientOptions = (clients.data ?? []).map((c) => ({ value: c.id, label: c.tradeName }));
  const projectOptions = (projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.title}`, keywords: [p.code] }));

  return (
    <>
      <PageHeader crumbs={[{ label: "Financeiro", icon: "finance", href: canWriteAll("receivables") ? "/financeiro/visao-geral" : undefined }, { label: "A receber", icon: "receivable" }]} count={rows?.length} />
      <Toolbar
        end={
          <>
            {selected.length > 0 && (
              <Button variant="secondary" size="sm" icon="download" onClick={exportCsv}>
                Exportar CSV ({selected.length})
              </Button>
            )}
            {canWriteAll("receivables") && (
              <Button variant="primary" size="sm" icon="add" className="max-md:hidden" onClick={() => setCreating(true)}>
                Novo recebível
              </Button>
            )}
          </>
        }
      >
        <SearchInput className="max-md:w-48 max-md:shrink-0" value={f.q} onChange={(v) => set({ q: v })} placeholder="Buscar projeto, cliente, NF…" />
        <FilterSelectChip label="Cliente" icon="clients" value={f.cliente} onChange={(v) => set({ cliente: v })} options={clientOptions} searchPlaceholder="Buscar cliente…" />
        <FilterSelectChip label="Projeto" icon="project" value={project?.id} onChange={(v) => set({ projeto: v ? (projects.data?.find((p) => p.id === v)?.code ?? v) : undefined })} options={projectOptions} searchPlaceholder="Buscar projeto…" />
        <MonthFilterChip value={f.mes} onChange={(v) => set({ mes: v })} />
        <FilterChip label={`Vence em ${soonDays} dias`} icon="due" active={!!f.vence} aria-pressed={!!f.vence} onClick={() => set({ vence: f.vence ? undefined : "1" })} onClear={f.vence ? () => set({ vence: undefined }) : undefined} />
        <ClearFiltersButton show={activeCount > 0} onClick={() => set({ status: "todos", cliente: undefined, mes: undefined, projeto: undefined, vence: undefined, q: "", aberto: undefined })} />
      </Toolbar>
      <div className="border-b border-line bg-surface px-3 py-2 md:px-4">
        <StatusChips label="Status" value={f.status} onChange={(v) => { set({ status: v }); setSelected([]); }} options={statusOptions} />
      </div>
      <PageBody padded={false}>
        {rows && totals && rows.length > 0 && canMoney && (
          <SummaryStrip
            items={[
              { label: "Total", value: money(totals.amount) },
              { label: "Impostos", value: money(totals.tax) },
            ]}
          />
        )}
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          onRowClick={(r) => set({ aberto: r.id })}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          initialSort={{ id: "due", dir: "asc" }}
          pageSize={25}
          empty={{
            icon: "receivable",
            title: activeCount > 0 || f.status !== "todos" ? "Nenhum lançamento com esses filtros" : "Nenhum lançamento a receber",
            description: activeCount > 0 || f.status !== "todos" ? "Ajuste ou limpe os filtros para ver mais resultados." : "Lançamentos nascem das parcelas das propostas aprovadas ou da importação de planilha.",
            action: canWriteAll("receivables") && activeCount === 0 && f.status === "todos" ? { label: "Importar recebíveis", href: "/financeiro/importar", icon: "upload" } : undefined,
          }}
          footer={
            totals && (
              <TotalsRow
                span={99}
                label={
                  <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span>Total · {rows?.length} lançamentos</span>
                    <span>
                      Valor <strong className="ml-1 text-sm text-fg"><Money cents={totals.amount} /></strong>
                    </span>
                    <span>
                      Impostos <strong className="ml-1 text-sm text-fg"><Money cents={totals.tax} /></strong>
                    </span>
                  </span>
                }
                cells={[]}
              />
            )
          }
        />
      </PageBody>
      <ReceivableSheet row={open} onClose={() => set({ aberto: undefined })} />
      {canWriteAll("receivables") && <Fab label="Novo recebível" onClick={() => setCreating(true)} />}
      <NewReceivableDialog open={creating} onOpenChange={setCreating} onCreated={(id) => set({ aberto: id })} />
    </>
  );
}
