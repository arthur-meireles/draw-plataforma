"use client";
import { SegmentedControl, ViewSwitcher } from "@/components/ui";
import { TASK_VIEW_OPTIONS, TaskPeek, TaskViews, useTaskView, type PersonRef } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiQuery } from "@/data/hooks";
import { tasksApi, type TaskFilters } from "@/data/services";
import { useUrlState } from "@/lib/use-url-state";
import { useProjectMembers, type ProjectDetail } from "./use-project";

type Filter = "todas" | "minhas" | "abertas";

/** Aba "Tarefas": lista agrupada por etapa com criação rápida, filtros na URL e peek lateral (`?tarefa=`). */
export function ProjectTasks({ project }: { project: ProjectDetail }) {
  const { isFreelancer, canWrite } = usePermissions();
  const [url, setUrl] = useUrlState({ filtro: "todas", tarefa: undefined as string | undefined });
  const filtro = (["todas", "minhas", "abertas"].includes(url.filtro) ? url.filtro : "todas") as Filter;
  const [view, setView] = useTaskView("lista");
  const members = useProjectMembers(project.id);

  const filters: TaskFilters = {
    projectId: project.id,
    assignee: filtro === "minhas" ? "me" : undefined,
    statusKey: filtro === "abertas" ? ["a_fazer", "em_andamento", "em_revisao"] : undefined,
  };
  const tasks = useApiQuery(["tasks", "project", filters], () => tasksApi.list(filters));
  const team: PersonRef[] = (members.data ?? []).filter((m) => m.active).map((m) => (m.userId ? { kind: "user", id: m.userId } : { kind: "freelancer", id: m.freelancerId! }));
  const canCreate = !isFreelancer && canWrite("tasks") && !["arquivado", "cancelado", "perdido"].includes(project.status);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <SegmentedControl
          aria-label="Filtrar tarefas"
          value={filtro}
          onChange={(v) => setUrl({ filtro: v })}
          options={[
            { value: "todas", label: "Todas" },
            { value: "abertas", label: "Abertas" },
            { value: "minhas", label: "Minhas" },
          ]}
        />
        <span className="text-xs text-fg-subtle">{tasks.data ? `${tasks.data.length} ${tasks.data.length === 1 ? "tarefa" : "tarefas"}` : ""}</span>
        <span className="flex-1" />
        <ViewSwitcher value={view} onChange={setView} views={TASK_VIEW_OPTIONS} />
      </div>
      <TaskViews
        tasks={tasks.data}
        isLoading={tasks.isLoading}
        error={tasks.error}
        onRetry={() => tasks.refetch()}
        view={view}
        onViewChange={setView}
        onOpen={(t) => setUrl({ tarefa: t.id })}
        readOnly={["arquivado", "cancelado"].includes(project.status)}
        listProps={{
          groupBy: "stage",
          restrictAssignees: team,
          quickAdd: canCreate ? { projectId: project.id } : undefined,
          empty: { title: filtro === "minhas" ? "Nenhuma tarefa sua neste projeto" : filtro === "abertas" ? "Nenhuma tarefa aberta" : "Nenhuma tarefa ainda", description: filtro === "todas" ? (canCreate ? "Crie a primeira tarefa abaixo. Ao ativar o projeto, as tarefas do modelo do tipo são geradas por etapa." : "As tarefas do projeto aparecem aqui.") : "Troque o filtro para ver as demais tarefas." },
        }}
      />
      <TaskPeek taskId={url.tarefa ?? null} onClose={() => setUrl({ tarefa: undefined })} restrictAssignees={team} />
    </div>
  );
}
