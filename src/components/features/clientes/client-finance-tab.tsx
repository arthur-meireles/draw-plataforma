"use client";
/** Aba "Financeiro": recebíveis do cliente (RF-M2-02). Só para quem vê valores. */
import { DataTable, type Column } from "@/components/ui";
import { Money, ProjectCode, ReceivableStatusBadge } from "@/components/domain";
import { dateFull } from "@/lib/format";
import type { ClientDetail } from "./use-clients";

type Row = ClientDetail["receivables"][number];

export function ClientFinanceTab({ client: c }: { client: ClientDetail }) {
  const open = c.receivables.filter((r) => r.status !== "recebido" && r.status !== "cancelado").reduce((a, r) => a + r.amountCents, 0);
  const columns: Column<Row>[] = [
    { id: "desc", header: "Descrição", mobile: "title", sortValue: (r) => r.description, cell: (r) => <span className="font-medium text-fg">{r.description}</span> },
    { id: "project", header: "Projeto", mobile: "subtitle", sortValue: (r) => r.projectCode, cell: (r) => <ProjectCode code={r.projectCode} /> },
    { id: "status", header: "Status", mobile: "meta", sortValue: (r) => r.status, cell: (r) => <ReceivableStatusBadge status={r.status} /> },
    { id: "invoice", header: "NF", hideBelow: "lg", mobile: "hidden", cell: (r) => <span className="text-fg-muted">{r.invoiceNumber ?? "—"}</span> },
    { id: "expected", header: "Previsão", hideBelow: "md", mobile: "meta", sortValue: (r) => r.expectedAt, cell: (r) => <span className="text-fg-muted">{dateFull(r.expectedAt)}</span> },
    { id: "received", header: "Recebido em", hideBelow: "lg", mobile: "hidden", sortValue: (r) => r.receivedAt, cell: (r) => <span className="text-fg-muted">{r.receivedAt ? dateFull(r.receivedAt) : "—"}</span> },
    { id: "amount", header: "Valor", align: "right", mobile: "trailing", sortValue: (r) => r.amountCents, cell: (r) => <Money cents={r.amountCents} className="font-medium text-fg" /> },
  ];
  return (
    <DataTable
      rows={c.receivables}
      columns={columns}
      getRowId={(r) => r.id}
      initialSort={{ id: "expected", dir: "asc" }}
      empty={{ icon: "receivable", title: "Sem lançamentos a receber", description: "Os recebíveis nascem das parcelas das propostas aprovadas." }}
      footer={
        c.receivables.length ? (
          <tr>
            <td colSpan={6} className="px-4 py-2 text-xs font-medium text-fg-subtle">
              Em aberto
            </td>
            <td className="px-4 py-2 text-right text-sm font-semibold text-fg">
              <Money cents={open} />
            </td>
          </tr>
        ) : undefined
      }
    />
  );
}
