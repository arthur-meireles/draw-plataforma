"use client";
/** Minhas tarefas (RF-M4-08): atrasadas, hoje, esta semana, depois — ou por projeto / status. */
import { useMemo } from "react";
import { Badge, Checkbox, PageBody, PageHeader, SearchInput, SegmentedControl, Toolbar, ClearFiltersButton, ViewSwitcher } from "@/components/ui";
import { TASK_VIEW_OPTIONS, TaskPeek, TaskViews, useTaskView } from "@/components/domain";
import { useApiQuery } from "@/data/hooks";
import { tasksApi } from "@/data/services";
import { plural } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";

type Group = "prazo" | "projeto" | "status";
const GROUP_TO_LIST = { prazo: "due", projeto: "project", status: "status" } as const;

export function MyTasksView() {
  const [f, set] = useUrlState({ agrupar: "prazo", concluidas: undefined as string | undefined, encerrados: undefined as string | undefined, q: "", tarefa: undefined as string | undefined });
  const [view, setView] = useTaskView("lista");
  const group = (["prazo", "projeto", "status"].includes(f.agrupar) ? f.agrupar : "prazo") as Group;
  const showDone = f.concluidas === "1";
  const showClosed = f.encerrados === "1";
  const q = useApiQuery(["tasks", "mine", f.q, showClosed], () => tasksApi.list({ assignee: "me", q: f.q || undefined, includeClosedProjects: showClosed }));

  const { visible, open, overdue } = useMemo(() => {
    const all = q.data ?? [];
    const open = all.filter((t) => t.statusKey !== "concluida");
    return { visible: showDone ? all : open, open: open.length, overdue: open.filter((t) => t.isOverdue).length };
  }, [q.data, showDone]);

  return (
    <>
      <PageHeader crumbs={[{ label: "Minhas tarefas", icon: "myTasks" }]} count={q.data ? open : undefined} actions={
          <>
            {overdue > 0 && <Badge tone="danger" dot className="max-sm:hidden">{plural(overdue, "atrasada", "atrasadas")}</Badge>}
            <ViewSwitcher value={view} onChange={setView} views={TASK_VIEW_OPTIONS} />
          </>
        }
      />
      <Toolbar
        end={
          <span className="flex flex-wrap items-center gap-3">
            <Checkbox checked={showClosed} onCheckedChange={(v) => set({ encerrados: v ? "1" : undefined })} label="Incluir projetos encerrados" />
            <Checkbox checked={showDone} onCheckedChange={(v) => set({ concluidas: v ? "1" : undefined })} label="Mostrar concluídas" />
          </span>
        }
      >
        <SearchInput value={f.q} onChange={(v) => set({ q: v })} placeholder="Buscar nas minhas tarefas…" className="w-64 max-md:w-48" />
        {view === "lista" && (
        <SegmentedControl<Group>
          aria-label="Agrupar tarefas"
          value={group}
          onChange={(v) => set({ agrupar: v })}
          options={[
            { value: "prazo", label: "Por prazo" },
            { value: "projeto", label: "Por projeto" },
            { value: "status", label: "Por status" },
          ]}
        />
        )}
        <ClearFiltersButton show={!!f.q || showDone || showClosed || group !== "prazo"} onClick={() => set({ q: "", concluidas: undefined, encerrados: undefined, agrupar: "prazo" })} />
      </Toolbar>
      <PageBody padded={false}>
        <TaskViews
          tasks={visible}
          isLoading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          view={view}
          onViewChange={setView}
          showProject
          onOpen={(t) => set({ tarefa: t.id })}
          listProps={{
            groupBy: GROUP_TO_LIST[group],
            empty: f.q ? { icon: "search", title: "Nenhuma tarefa encontrada", description: "Tente outro termo de busca." } : { icon: "success", title: showDone ? "Você ainda não tem tarefas" : "Tudo em dia", description: showDone ? "Quando alguém atribuir uma tarefa a você, ela aparece aqui." : "Nenhuma tarefa aberta atribuída a você. Marque “Mostrar concluídas” para rever o que já entregou." },
          }}
        />
      </PageBody>
      <TaskPeek taskId={f.tarefa ?? null} onClose={() => set({ tarefa: undefined })} />
    </>
  );
}
