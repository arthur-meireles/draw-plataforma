"use client";
import { ProjectGroup, ProjectRow, StageIcon, stageProgress } from "@/components/domain";
import { Skeleton } from "@/components/ui";
import { PROJECT_STAGES } from "@/data/reference";
import type { ProjectListItem } from "@/data/services";

/** Lista agrupada por etapa (visão padrão no celular). */
export function ProjectListView({ projects, isLoading }: { projects: ProjectListItem[] | undefined; isLoading?: boolean }) {
  if (isLoading)
    return (
      <div className="space-y-px p-3 md:p-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  return (
    <div>
      {PROJECT_STAGES.filter((s) => s.key !== "concluido").map((s) => {
        const rows = (projects ?? []).filter((p) => p.projectStageKey === s.key).sort((a, b) => a.position - b.position);
        if (!rows.length) return null;
        return (
          <ProjectGroup key={s.key} title={s.label} count={rows.length} icon={<StageIcon category={s.category} progress={s.category === "open" ? stageProgress(s.key) : undefined} />}>
            {rows.map((p) => (
              <ProjectRow key={p.id} project={p} showStage={false} />
            ))}
          </ProjectGroup>
        );
      })}
    </div>
  );
}
