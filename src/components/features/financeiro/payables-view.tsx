"use client";
import { useMemo, useState } from "react";
import { PayableStatusBadge, ProjectCode } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Button, ClearFiltersButton, DataTable, Fab, FilterSelectChip, MonthFilterChip, PageBody, PageHeader, SearchInput, StatusChips, Toolbar, Tooltip, type Column } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { PAYABLE_STATUS_LABEL } from "@/data/reference";
import { financeApi } from "@/data/services";
import type { PayableKind, PayableStatus } from "@/data/types";
import { dateFull } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { ExpenseDialog } from "./expense-dialog";
import { InvoicedAmount, PAYABLE_KIND_LABEL, PayableAmount } from "./payable-bits";
import { PayableSheet } from "./payable-sheet";
import { SummaryStrip, TotalsRow } from "./totals-row";
import type { PayableRow } from "./types";

const STATUSES: PayableStatus[] = ["aguardando_nf", "em_conferencia", "divergente", "aprovado", "pago"];
const KINDS = (Object.keys(PAYABLE_KIND_LABEL) as PayableKind[]).map((k) => ({ value: k, label: PAYABLE_KIND_LABEL[k] }));

const columns: Column<PayableRow>[] = [
  {
    id: "due",
    header: <Tooltip content="Freelancers vencem no dia 20 do mês seguinte à conclusão do projeto (RN-06)."><span className="cursor-help underline decoration-dotted underline-offset-2">Vencimento</span></Tooltip>,
    sortValue: (r) => r.dueAt,
    mobile: "subtitle",
    cell: (r) => <span className={r.isOverdue ? "text-danger" : "text-fg-muted"}>{dateFull(r.dueAt)}</span>,
  },
  { id: "payee", header: "Favorecido", sortValue: (r) => r.freelancerName ?? r.description, mobile: "title", cell: (r) => <span className="font-medium text-fg">{r.freelancerName ?? PAYABLE_KIND_LABEL[r.kind]}<span className="ml-2 hidden font-normal text-fg-subtle max-md:inline">{r.projectCode}</span></span> },
  { id: "desc", header: "Descrição", hideBelow: "xl", mobile: "hidden", sortValue: (r) => r.description, cell: (r) => <span className="line-clamp-1 max-w-64 text-fg-muted">{r.description}</span> },
  { id: "project", header: "Projeto", hideBelow: "md", sortValue: (r) => r.projectCode ?? "", mobile: "hidden", cell: (r) => (r.projectCode ? <ProjectCode code={r.projectCode} /> : <span className="text-fg-subtle">Administrativo</span>) },
  { id: "agreed", header: "Acordado", align: "right", hideBelow: "md", mobile: "hidden", sortValue: (r) => r.agreedAmountCents, cell: (r) => <PayableAmount cents={r.agreedAmountCents} className="text-fg-muted" /> },
  { id: "invoiced", header: "Valor NF", align: "right", mobile: "trailing", sortValue: (r) => r.invoicedAmountCents ?? r.agreedAmountCents, cell: (r) => (r.kind === "freelancer" ? <InvoicedAmount row={r} /> : <PayableAmount cents={r.agreedAmountCents} />) },
  { id: "nf", header: "NF nº", hideBelow: "lg", mobile: "hidden", sortValue: (r) => r.invoiceNumber ?? "", cell: (r) => <span className="text-fg-muted">{r.invoiceNumber ?? "—"}</span> },
  { id: "status", header: "Status", sortValue: (r) => r.status, mobile: "meta", cell: (r) => <PayableStatusBadge status={r.status} /> },
];

export function PayablesView() {
  const { canWriteAll, isFreelancer } = usePermissions();
  const [f, set, activeCount] = useUrlState({ status: "todos", tipo: undefined as string | undefined, mes: undefined as string | undefined, q: "", aberto: undefined as string | undefined });
  const [expense, setExpense] = useState(false);
  const q = useApiQuery(["finance", "payables", f.tipo, f.mes, f.q], () => financeApi.payables({ kind: f.tipo as PayableKind | undefined, month: f.mes, q: f.q }));
  const all = q.data;
  const rows = useMemo(() => (f.status === "todos" ? all : all?.filter((r) => r.status === f.status)), [all, f.status]);
  const open = all?.find((r) => r.id === f.aberto) ?? null;
  const writable = canWriteAll("payables");
  const filtered = activeCount > 0 || f.status !== "todos";

  const total = rows?.reduce((a, r) => a + (r.invoicedAmountCents ?? r.agreedAmountCents), 0) ?? 0;
  const divergentCount = all?.filter((r) => r.status === "divergente").length ?? 0;
  const options = [{ value: "todos", label: "Todos", count: all?.length }, ...STATUSES.map((s) => ({ value: s, label: PAYABLE_STATUS_LABEL[s], count: all?.filter((r) => r.status === s).length }))];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Financeiro", icon: "finance", href: isFreelancer ? undefined : "/financeiro/visao-geral" }, { label: isFreelancer ? "Meus pagamentos" : "A pagar", icon: "payable" }]}
        count={rows?.length}
        actions={
          writable && (
            <Button variant="primary" size="sm" icon="add" onClick={() => setExpense(true)} className="max-md:hidden">
              Nova despesa
            </Button>
          )
        }
      />
      <Toolbar>
        <SearchInput value={f.q} onChange={(v) => set({ q: v })} placeholder={isFreelancer ? "Buscar projeto…" : "Buscar favorecido, projeto…"} />
        {!isFreelancer && <FilterSelectChip label="Tipo" icon="filter" value={f.tipo as PayableKind | undefined} onChange={(v) => set({ tipo: v })} options={KINDS} />}
        <MonthFilterChip label="Vencimento" value={f.mes} onChange={(v) => set({ mes: v })} />
        <ClearFiltersButton show={filtered} onClick={() => set({ status: "todos", tipo: undefined, mes: undefined, q: "", aberto: undefined })} />
      </Toolbar>
      <div className="border-b border-line bg-surface px-3 py-2 md:px-4">
        <StatusChips label="Status" value={f.status} onChange={(v) => set({ status: v })} options={options} />
      </div>
      <PageBody padded={false}>
        {rows && rows.length > 0 && !isFreelancer && (
          <SummaryStrip
            items={[
              { label: "Total", value: <PayableAmount cents={total} /> },
              ...(divergentCount ? [{ label: "Divergentes", value: String(divergentCount) }] : []),
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
          initialSort={{ id: "due", dir: "asc" }}
          pageSize={25}
          empty={{
            icon: "payable",
            title: filtered ? "Nenhuma conta com esses filtros" : isFreelancer ? "Você não tem pagamentos por aqui" : "Nenhuma conta a pagar",
            description: filtered ? "Ajuste ou limpe os filtros para ver mais resultados." : isFreelancer ? "Quando um projeto seu for concluído, o pedido de NF aparece aqui." : "Contas de freelancers nascem ao concluir um projeto (RN-03). Despesas você lança manualmente.",
            action: writable && !filtered ? { label: "Nova despesa", onClick: () => setExpense(true), icon: "add" } : undefined,
          }}
          footer={
            !isFreelancer &&
            rows && (
              <TotalsRow
                span={99}
                label={
                  <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span>Total · {rows.length} contas</span>
                    <span>
                      A pagar <strong className="ml-1 text-sm text-fg"><PayableAmount cents={total} /></strong>
                    </span>
                  </span>
                }
                cells={[]}
              />
            )
          }
        />
      </PageBody>
      {writable && <Fab label="Nova despesa" onClick={() => setExpense(true)} />}
      <PayableSheet row={open} onClose={() => set({ aberto: undefined })} />
      {expense && <ExpenseDialog open onOpenChange={setExpense} />}
    </>
  );
}
