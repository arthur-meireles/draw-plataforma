"use client";
import { Suspense, useMemo, useState } from "react";
import { AccessGate, TASK_VIEW_OPTIONS, TaskPeek, TaskViews, useTaskView } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Button, ClearFiltersButton, Switch, EmptyState, Fab, PageBody, PageHeader, SearchInput, SelectField, Tabs, Toolbar, ViewSwitcher } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { tasksApi, type TaskView } from "@/data/services";
import type { AdmArea, TaskStatusKey } from "@/data/types";
import { useUrlState } from "@/lib/use-url-state";
import { areaKanbanColumns } from "./area-board";
import { AdmTaskDialog } from "./adm-task-dialog";
import { BacklogList } from "./backlog-list";
import { SprintFormDialog } from "./sprint-form-dialog";
import { SprintList, SprintStatusBadge } from "./sprint-list";

type Vista = "area" | "sprint" | "backlog" | "sprints";

function Content() {
  const p = usePermissions();
  const canEdit = p.canWriteAll("adm");
  const [url, setUrl] = useUrlState({ vista: "area" as string, concluidas: "", tarefa: undefined as string | undefined, sprint: undefined as string | undefined, q: "" });
  const vista = (["area", "sprint", "backlog", "sprints"].includes(url.vista) ? url.vista : "area") as Vista;

  const [view, setView] = useTaskView(vista === "backlog" ? "lista" : "kanban");
  const sprints = useApiQuery(["sprints"], tasksApi.sprints);
  const tasks = useApiQuery(["tasks", "adm"], () => tasksApi.list({ module: "adm" }));

  const [sprintDialog, setSprintDialog] = useState(false);
  const [taskDialog, setTaskDialog] = useState<{ statusKey?: TaskStatusKey; sprintId?: string | null; area?: AdmArea | null } | null>(null);

  const current = useMemo(() => {
    const list = sprints.data ?? [];
    return list.find((s) => s.id === url.sprint) ?? list.find((s) => s.status === "ativa") ?? [...list].sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
  }, [sprints.data, url.sprint]);

  const q = url.q.trim().toLowerCase();
  const match = (t: TaskView) => !q || t.title.toLowerCase().includes(q);
  const showDone = url.concluidas === "1";
  const areaTasks = tasks.data?.filter((t) => !t.parentTaskId && (showDone || t.statusKey !== "concluida")).filter(match);
  const areaCount = tasks.data?.filter((t) => !t.parentTaskId && t.statusKey !== "concluida").length;
  const sprintTasks = tasks.data?.filter((t) => t.sprintId === current?.id).filter(match);
  const backlogTasks = tasks.data?.filter((t) => !t.sprintId).filter(match);
  const backlogCount = tasks.data?.filter((t) => !t.sprintId).length;

  const openTask = (t: TaskView) => setUrl({ tarefa: t.id });
  const sprintOptions = (sprints.data ?? []).filter((s) => s.status !== "concluida").map((s) => ({ value: s.id, label: s.name }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Administrativo", icon: "adm", href: "/adm/tarefas" }, { label: "Tarefas" }]}
        actions={
          <>
            {vista !== "sprints" && <ViewSwitcher value={view} onChange={setView} views={TASK_VIEW_OPTIONS} />}
            {canEdit && (
            <>
              <Button size="sm" variant="outline" icon="sprint" onClick={() => setSprintDialog(true)} className="max-md:hidden">
                Nova sprint
              </Button>
              <Button size="sm" variant="primary" icon="add" onClick={() => setTaskDialog({ sprintId: vista === "sprint" ? current?.id : null })} className="max-md:hidden">
                Nova tarefa
              </Button>
            </>
            )}
          </>
        }
      />
      <Tabs
        value={vista}
        onChange={(v) => setUrl({ vista: v })}
        items={[
          { value: "area", label: "Por área", icon: "adm", count: areaCount },
          { value: "sprint", label: "Sprint atual", icon: "viewKanban" },
          { value: "backlog", label: "Backlog", icon: "viewList", count: backlogCount },
          { value: "sprints", label: "Sprints", icon: "sprint", count: sprints.data?.length },
        ]}
      />
      {vista !== "sprints" && (
        <Toolbar>
          {vista === "sprint" && (sprints.data?.length ?? 0) > 0 && (
            <div className="w-56 max-md:w-48 shrink-0">
              <SelectField
                aria-label="Sprint exibida"
                options={(sprints.data ?? []).map((s) => ({ value: s.id, label: s.name, description: s.status === "ativa" ? "Sprint atual" : s.status === "planejada" ? "Planejada" : "Concluída" }))}
                value={current?.id}
                onChange={(v) => setUrl({ sprint: v ?? undefined })}
                className="h-7 max-md:h-9"
              />
            </div>
          )}
          {vista === "sprint" && current && <SprintStatusBadge status={current.status} />}
          <SearchInput value={url.q} onChange={(v) => setUrl({ q: v })} placeholder="Buscar tarefa…" className="max-md:w-44 max-md:shrink-0" />
          {vista === "area" && <Switch size="sm" checked={showDone} onCheckedChange={(v) => setUrl({ concluidas: v ? "1" : "" })} label="Mostrar concluídas" />}
          <ClearFiltersButton show={!!url.q} onClick={() => setUrl({ q: "" })} />
        </Toolbar>
      )}

      <PageBody padded={false} className="flex flex-col">
        {vista === "area" && (
          <TaskViews
            tasks={areaTasks}
            isLoading={tasks.isLoading}
            error={tasks.error}
            onRetry={() => tasks.refetch()}
            view={view}
            onViewChange={setView}
            onOpen={openTask}
            readOnly={!canEdit}
            kanbanColumns={areaKanbanColumns(canEdit)}
            listProps={{ groupBy: "area", quickAdd: canEdit ? { module: "adm", sprintId: null } : undefined, empty: { title: q ? "Nenhuma tarefa encontrada" : "Nenhuma pendência", description: q ? "Tente outro termo de busca." : "As tarefas internas aparecem aqui, por área." } }}
          />
        )}
        {vista === "sprint" &&
          (sprints.isLoading || !sprints.data || current ? (
            <TaskViews
              tasks={sprintTasks}
              isLoading={sprints.isLoading || tasks.isLoading}
              error={tasks.error}
              onRetry={() => tasks.refetch()}
              view={view}
              onViewChange={setView}
              onOpen={openTask}
              readOnly={!canEdit}
              onAdd={(statusKey) => setTaskDialog({ statusKey: statusKey as TaskStatusKey, sprintId: current?.id })}
              listProps={{ groupBy: "status", quickAdd: canEdit && current ? { module: "adm", sprintId: current.id } : undefined, empty: { title: "Nenhuma tarefa na sprint", description: "Adicione tarefas a esta sprint pelo backlog ou crie uma nova." } }}
            />
          ) : (
            <EmptyState icon="sprint" title="Nenhuma sprint ainda" description="Crie uma sprint para organizar o quadro de tarefas internas." action={canEdit ? { label: "Nova sprint", icon: "add", onClick: () => setSprintDialog(true) } : undefined} />
          ))}
        {vista === "backlog" &&
          (view === "lista" ? (
            <BacklogList tasks={backlogTasks} sprints={sprints.data ?? []} isLoading={tasks.isLoading} error={tasks.error} onRetry={() => tasks.refetch()} canEdit={canEdit} onOpen={openTask} />
          ) : (
            <TaskViews tasks={backlogTasks} isLoading={tasks.isLoading} error={tasks.error} onRetry={() => tasks.refetch()} view={view} onViewChange={setView} onOpen={openTask} readOnly={!canEdit} onAdd={(statusKey) => setTaskDialog({ statusKey: statusKey as TaskStatusKey, sprintId: null })} />
          ))}
        {vista === "sprints" && <SprintList sprints={sprints.data} tasks={tasks.data} isLoading={sprints.isLoading} error={sprints.error} onRetry={() => sprints.refetch()} canEdit={canEdit} onCreate={() => setSprintDialog(true)} onOpenBoard={(s) => setUrl({ vista: "sprint", sprint: s.id })} />}
      </PageBody>

      {canEdit && <Fab label={vista === "sprints" ? "Nova sprint" : "Nova tarefa"} onClick={() => (vista === "sprints" ? setSprintDialog(true) : setTaskDialog({ sprintId: vista === "sprint" ? current?.id : null }))} />}
      <SprintFormDialog open={sprintDialog} onOpenChange={setSprintDialog} />
      <AdmTaskDialog open={!!taskDialog} onOpenChange={(o) => !o && setTaskDialog(null)} defaults={taskDialog ?? undefined} sprintOptions={sprintOptions} />
      <TaskPeek taskId={url.tarefa ?? null} onClose={() => setUrl({ tarefa: undefined })} />
    </>
  );
}

export function AdmTasksView() {
  return (
    <AccessGate resource="adm">
      <Suspense>
        <Content />
      </Suspense>
    </AccessGate>
  );
}
