"use client";
/** Aba "Propostas": todas as versões das propostas dos projetos do cliente (RF-M2-02). */
import { DataTable, type Column } from "@/components/ui";
import { Money, ProjectCode, ProposalStatusBadge } from "@/components/domain";
import { dateFull } from "@/lib/format";
import type { ClientDetail } from "./use-clients";

type Row = ClientDetail["proposals"][number];

export function ClientProposalsTab({ client: c }: { client: ClientDetail }) {
  const columns: Column<Row>[] = [
    { id: "project", header: "Projeto", mobile: "title", sortValue: (r) => r.projectCode, cell: (r) => <ProjectCode code={r.projectCode} className="text-sm text-fg" /> },
    { id: "version", header: "Versão", mobile: "subtitle", sortValue: (r) => r.version, cell: (r) => <span className="text-fg-muted">v{r.version}</span> },
    { id: "status", header: "Status", mobile: "meta", sortValue: (r) => r.status, cell: (r) => <ProposalStatusBadge status={r.status} /> },
    { id: "sent", header: "Enviada em", hideBelow: "md", mobile: "meta", sortValue: (r) => r.sentAt, cell: (r) => <span className="text-fg-muted">{r.sentAt ? dateFull(r.sentAt) : "—"}</span> },
    { id: "approved", header: "Aprovada em", hideBelow: "lg", mobile: "hidden", sortValue: (r) => r.approvedAt, cell: (r) => <span className="text-fg-muted">{r.approvedAt ? dateFull(r.approvedAt) : "—"}</span> },
    { id: "amount", header: "Valor", align: "right", mobile: "trailing", sortValue: (r) => r.amountCents, cell: (r) => <Money cents={r.amountCents} className="font-medium text-fg" /> },
  ];
  return (
    <DataTable
      rows={c.proposals}
      columns={columns}
      getRowId={(r) => r.id}
      rowHref={(r) => `/projetos/${r.projectCode}?aba=propostas`}
      initialSort={{ id: "project", dir: "asc" }}
      empty={{ icon: "proposal", title: "Nenhuma proposta ainda", description: "As propostas aparecem aqui quando uma cotação deste cliente recebe a primeira versão." }}
    />
  );
}
