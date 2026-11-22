"use client";
/** Aba "Projetos": linhas agrupadas por status (RF-M2-02). */
import { EmptyState } from "@/components/ui";
import { ProjectGroup, ProjectRow } from "@/components/domain";
import { PROJECT_STATUS_LABEL } from "@/data/reference";
import type { ProjectStatus } from "@/data/types";
import type { ClientDetail } from "./use-clients";

const ORDER: ProjectStatus[] = ["ativo", "cotacao", "concluido", "arquivado", "perdido", "cancelado"];

export function ClientProjectsTab({ client: c, canCreate }: { client: ClientDetail; canCreate: boolean }) {
  if (!c.projects.length)
    return (
      <EmptyState
        icon="project"
        title="Nenhum projeto para este cliente"
        description="Abra uma cotação ou crie um projeto para começar o relacionamento."
        action={canCreate ? { label: "Novo projeto", href: `/projetos/novo?cliente=${c.id}`, icon: "add" } : undefined}
        secondaryAction={canCreate ? { label: "Nova cotação", href: `/projetos/novo?origem=cotacao&cliente=${c.id}` } : undefined}
      />
    );
  return (
    <div>
      {ORDER.map((status) => {
        const rows = c.projects.filter((p) => p.status === status);
        if (!rows.length) return null;
        return (
          <ProjectGroup key={status} title={PROJECT_STATUS_LABEL[status]} count={rows.length}>
            {rows.map((p) => (
              <ProjectRow key={p.id} project={p} showValue />
            ))}
          </ProjectGroup>
        );
      })}
    </div>
  );
}
