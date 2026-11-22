"use client";
/** Aba "Projetos": alocações do freelancer com papel, valor combinado e situação (RF-M2-04). */
import { Badge, DataTable, type Column } from "@/components/ui";
import { ProjectCode, ProjectStatusBadge } from "@/components/domain";
import { MEMBER_ROLE_LABEL } from "@/data/reference";
import { FreelancerMoney } from "./freelancer-money";
import type { FreelancerDetail } from "./use-freelancers";

type Row = FreelancerDetail["projects"][number];

export function FreelancerProjectsTab({ freelancer: f, showMoney }: { freelancer: FreelancerDetail; showMoney: boolean }) {
  const columns: Column<Row>[] = [
    { id: "code", header: "Código", width: "6rem", mobile: "hidden", sortValue: (r) => r.code, cell: (r) => <ProjectCode code={r.code} /> },
    {
      id: "title",
      header: "Projeto",
      mobile: "title",
      sortValue: (r) => r.title,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block max-w-80 truncate font-medium text-fg max-md:max-w-none">{r.title}</span>
          <span className="block text-xs text-fg-subtle">
            {r.code} · {r.clientName}
          </span>
        </span>
      ),
    },
    { id: "role", header: "Papel", mobile: "subtitle", sortValue: (r) => r.memberRole, cell: (r) => <span className="text-fg-muted">{MEMBER_ROLE_LABEL[r.memberRole]}</span> },
    { id: "status", header: "Projeto", hideBelow: "md", mobile: "hidden", cell: (r) => <ProjectStatusBadge status={r.status} /> },
    { id: "member", header: "Alocação", mobile: "meta", sortValue: (r) => (r.memberActive ? 1 : 0), cell: (r) => <Badge tone={r.memberActive ? "success" : "neutral"} dot>{r.memberActive ? "Ativa" : "Saiu do projeto"}</Badge> },
    { id: "agreed", header: "Valor combinado", align: "right", mobile: "trailing", sortValue: (r) => r.agreedAmountCents, cell: (r) => <FreelancerMoney cents={r.agreedAmountCents} visible={showMoney} className="font-medium text-fg" /> },
  ];
  return (
    <DataTable
      rows={f.projects}
      columns={columns}
      getRowId={(r) => r.id}
      rowHref={(r) => `/projetos/${r.code}`}
      initialSort={{ id: "member", dir: "desc" }}
      empty={{ icon: "project", title: "Sem projetos alocados", description: "Quando este freelancer for incluído na equipe de um projeto, ele aparece aqui." }}
    />
  );
}
