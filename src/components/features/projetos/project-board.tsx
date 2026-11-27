"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Kanban, ProjectCard, StageIcon, stageProgress, type KanbanColumn } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { FIRST_PROJECT_STAGE, PROJECT_STAGES } from "@/data/reference";
import { projectsApi, type ProjectListItem } from "@/data/services";
import type { ProjectStageKey } from "@/data/types";

const columns: KanbanColumn<ProjectStageKey>[] = PROJECT_STAGES.map((s) => ({
  key: s.key,
  label: s.label,
  icon: <StageIcon category={s.category} progress={s.category === "open" ? stageProgress(s.key) : undefined} />,
  locked: s.key === "concluido",
  lockedHint: 'Use "Concluir projeto…" no projeto',
}));

/** Kanban de projetos ativos por etapa com arrastar (RF-M4-02/07). Atualização otimista; erro devolve o cartão e mostra aviso. */
export function ProjectBoard({ projects, isLoading }: { projects: ProjectListItem[] | undefined; isLoading?: boolean }) {
  const qc = useQueryClient();
  const { canWrite, isFreelancer } = usePermissions();
  const move = useApiMutation((a: { id: string; stageKey: ProjectStageKey; position: number }) => projectsApi.move(a.id, { stageKey: a.stageKey, position: a.position }), {
    success: false,
    onError: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const onMove = useCallback(
    (item: ProjectListItem, to: { column: ProjectStageKey; position: number }) => {
      qc.setQueriesData<ProjectListItem[]>({ queryKey: ["projects", "list"] }, (old) => old?.map((p) => (p.id === item.id ? { ...p, projectStageKey: to.column, position: to.position } : p)));
      move.mutate({ id: item.id, stageKey: to.column, position: to.position });
    },
    [qc, move],
  );

  const draggable = canWrite("projects") && !isFreelancer;
  return (
    <Kanban
      columns={columns}
      items={projects}
      isLoading={isLoading}
      getId={(p) => p.id}
      getColumn={(p) => p.projectStageKey ?? FIRST_PROJECT_STAGE}
      getPosition={(p) => p.position}
      renderCard={(p, { dragging }) => <ProjectCard project={p} dragging={dragging} />}
      onMove={onMove}
      canDrag={(p) => draggable && !p.pausedAt}
      emptyColumnText="Arraste um projeto para cá"
    />
  );
}
