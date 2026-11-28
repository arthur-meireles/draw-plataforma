"use client";
/** Aba "Pagamentos": contas a pagar do freelancer com status da NF (RF-M2-04). */
import { DataTable, type Column } from "@/components/ui";
import { PayableStatusBadge, ProjectCode } from "@/components/domain";
import { dateFull } from "@/lib/format";
import { FreelancerMoney } from "./freelancer-money";
import type { FreelancerDetail } from "./use-freelancers";

type Row = FreelancerDetail["payables"][number];

export function FreelancerPaymentsTab({ freelancer: f, showMoney }: { freelancer: FreelancerDetail; showMoney: boolean }) {
  // valor da NF quando houver (coerente com a lista de contas a pagar); canceladas não entram
  const pending = f.payables.filter((p) => p.status !== "pago" && p.status !== "cancelado").reduce((a, p) => a + (p.invoicedAmountCents ?? p.agreedAmountCents), 0);
  const columns: Column<Row>[] = [
    { id: "desc", header: "Descrição", mobile: "title", sortValue: (p) => p.description, cell: (p) => <span className="block max-w-80 truncate font-medium text-fg max-md:max-w-none max-md:whitespace-normal">{p.description}</span> },
    { id: "project", header: "Projeto", mobile: "subtitle", sortValue: (p) => p.projectCode, cell: (p) => <ProjectCode code={p.projectCode} /> },
    { id: "status", header: "Status", mobile: "meta", sortValue: (p) => p.status, cell: (p) => <PayableStatusBadge status={p.status} /> },
    { id: "due", header: "Vencimento", hideBelow: "md", mobile: "meta", sortValue: (p) => p.dueAt, cell: (p) => <span className="text-fg-muted">{dateFull(p.dueAt)}</span> },
    { id: "paid", header: "Pago em", hideBelow: "lg", mobile: "hidden", sortValue: (p) => p.paidAt, cell: (p) => <span className="text-fg-muted">{p.paidAt ? dateFull(p.paidAt) : "—"}</span> },
    { id: "invoiced", header: "Valor da NF", align: "right", hideBelow: "lg", mobile: "hidden", sortValue: (p) => p.invoicedAmountCents, cell: (p) => <FreelancerMoney cents={p.invoicedAmountCents} visible={showMoney} className="text-fg-muted" /> },
    { id: "agreed", header: "Combinado", align: "right", mobile: "trailing", sortValue: (p) => p.agreedAmountCents, cell: (p) => <FreelancerMoney cents={p.agreedAmountCents} visible={showMoney} className="font-medium text-fg" /> },
  ];
  return (
    <DataTable
      rows={f.payables}
      columns={columns}
      getRowId={(p) => p.id}
      rowHref={(p) => `/financeiro/pagar?aberto=${p.id}`}
      initialSort={{ id: "due", dir: "desc" }}
      empty={{ icon: "payable", title: "Nenhum pagamento registrado", description: "Os pagamentos nascem das alocações com valor combinado e seguem o fluxo de nota fiscal." }}
      footer={
        f.payables.length ? (
          <tr>
            <td colSpan={6} className="px-4 py-2 text-xs font-medium text-fg-subtle">
              A pagar (não pago)
            </td>
            <td className="px-4 py-2 text-right text-sm font-semibold text-fg">
              <FreelancerMoney cents={pending} visible={showMoney} />
            </td>
          </tr>
        ) : undefined
      }
    />
  );
}
