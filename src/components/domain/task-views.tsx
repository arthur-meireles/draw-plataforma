"use client";
/**
 * Visualizações de tarefas (RF-X-06): lista, kanban, calendário e Gantt sobre o MESMO conjunto de tarefas.
 * Reutilizado em Minhas tarefas, prontuário, Administrativo e início do freelancer.
 * A visão fica na URL (`?visao=`); abrir uma tarefa continua sendo `?tarefa=` via `onOpen` (TaskPeek).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button, EmptyState, ErrorState, Icon, Skeleton, type Tone, type ViewMode } from "@/components/ui";
import { tasksApi, type TaskView } from "@/data/services";
import { TASK_STATUSES } from "@/data/reference";
import { useApiMutation } from "@/data/hooks";
import { useUrlState } from "@/lib/use-url-state";
import { TaskStatusIcon } from "./badges";
import { Calendar, monthKey, type TimelineItem } from "./calendar";
import { Gantt, type GanttGroup } from "./gantt";
import { Kanban, type KanbanColumn } from "./kanban";
import { TaskCard } from "./task-card";
import { TaskList } from "./tasks";

export type TaskViewMode = Extract<ViewMode, "lista" | "kanban" | "calendario" | "gantt">;
export const TASK_VIEW_OPTIONS: TaskViewMode[] = ["lista", "kanban", "calendario", "gantt"];

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsWide = () => useSyncExternalStore(subscribe, () => window.matchMedia("(min-width: 768px)").matches, () => true);

/** Visão ativa na URL (`visao`). Padrão do chamador; no celular o kanban cede lugar à lista (10.6). */
export function useTaskView(defaultView: TaskViewMode = "lista") {
  const wide = useIsWide();
  const [url, set] = useUrlState({ visao: "" });
  const fallback: TaskViewMode = defaultView === "kanban" && !wide ? "lista" : defaultView;
  const view = (TASK_VIEW_OPTIONS as string[]).includes(url.visao) ? (url.visao as TaskViewMode) : fallback;
  return [view, (v: TaskViewMode) => set({ visao: v })] as const;
}

/** Agrupamento personalizado do kanban (ex.: áreas do Administrativo). Mover vira `toPatch` aplicado com `tasksApi.update`. */
export interface TaskKanbanColumns {
  columns: KanbanColumn<string>[];
  getColumn: (t: TaskView) => string;
  toPatch: (column: string, position: number) => Parameters<typeof tasksApi.update>[1];
  emptyColumnText?: string;
}


function taskTone(t: TaskView): Tone {
  if (t.statusKey === "concluida") return "success";
  if (t.isOverdue) return "danger";
  if (t.priorityKey === "urgente" || t.priorityKey === "alta") return "warning";
  return "accent";
}

const metaOf = (t: TaskView, showProject?: boolean) => (showProject && t.projectCode ? t.projectCode : (t.assigneeName ?? undefined));

export interface TaskViewsProps {
  tasks: TaskView[] | undefined;
  isLoading?: boolean;
  error?: { message?: string; status?: number } | null;
  onRetry?: () => void;
  view: TaskViewMode;
  /** Necessário para o atalho "ver na lista" do aviso de tarefas sem data. */
  onViewChange?: (v: TaskViewMode) => void;
  onOpen: (t: TaskView) => void;
  /** Repassado ao `TaskList` (visão lista). */
  listProps?: Omit<React.ComponentProps<typeof TaskList>, "tasks" | "isLoading" | "error" | "onRetry" | "onOpen">;
  /** Padrão: colunas por status. */
  kanbanColumns?: TaskKanbanColumns;
  /** Mostra o projeto nos cartões/linhas e agrupa o Gantt por projeto. */
  showProject?: boolean;
  /** Desabilita arrastar no kanban. */
  readOnly?: boolean;
  /** "+" nas colunas do kanban. */
  onAdd?: (column: string) => void;
  emptyText?: string;
}

export function TaskViews({ tasks, isLoading, error, onRetry, view, onViewChange, onOpen, listProps, kanbanColumns, showProject, readOnly, onAdd, emptyText }: TaskViewsProps) {
  const [url, setUrl] = useUrlState({ mes: "" });
  const [overrides, setOverrides] = useState<Record<string, Partial<TaskView>>>({});
  const update = useApiMutation(({ id, patch }: { id: string; patch: Parameters<typeof tasksApi.update>[1] }) => tasksApi.update(id, patch));

  // a lista nova do servidor substitui o estado otimista
  useEffect(() => setOverrides({}), [tasks]);
  const shown = useMemo(() => tasks?.map((t) => (overrides[t.id] ? { ...t, ...overrides[t.id] } : t)), [tasks, overrides]);

  const columns: TaskKanbanColumns = useMemo(
    () =>
      kanbanColumns ?? {
        columns: TASK_STATUSES.map((s) => ({ key: s.key, label: s.label, icon: <TaskStatusIcon status={s.key} /> })),
        getColumn: (t) => t.statusKey,
        toPatch: (column, position) => ({ statusKey: column as TaskView["statusKey"], position }),
        emptyColumnText: "Nenhuma tarefa",
      },
    [kanbanColumns],
  );

  const move = (t: TaskView, to: { column: string; position: number }) => {
    const patch = columns.toPatch(to.column, to.position);
    setOverrides((o) => ({ ...o, [t.id]: patch as Partial<TaskView> }));
    update.mutate(
      { id: t.id, patch },
      {
        onError: () =>
          setOverrides((o) => {
            const { [t.id]: _drop, ...rest } = o;
            return rest;
          }),
      },
    );
  };

  const calendarItems = useMemo<TimelineItem[]>(
    () =>
      (shown ?? []).filter((t) => t.dueAt).map((t) => {
        const end = t.dueAt!;
        const start = t.startAt && t.startAt.slice(0, 10) <= end.slice(0, 10) ? t.startAt : end;
        return { id: t.id, title: t.title, start, end, tone: taskTone(t), meta: metaOf(t, showProject), onSelect: () => onOpen(t) };
      }),
    [shown, showProject, onOpen],
  );

  const ganttItems = useMemo<TimelineItem[]>(
    () =>
      (shown ?? []).filter((t) => t.dueAt || t.startAt).map((t) => {
        const start = t.startAt ?? t.createdAt;
        const end = t.dueAt && t.dueAt.slice(0, 10) >= start.slice(0, 10) ? t.dueAt : start;
        const group = kanbanColumns ? kanbanColumns.getColumn(t) : showProject ? (t.projectCode ?? "adm") : t.statusKey;
        return { id: t.id, title: t.title, start, end, tone: taskTone(t), meta: metaOf(t, showProject), group, onSelect: () => onOpen(t) };
      }),
    [shown, showProject, kanbanColumns, onOpen],
  );

  const ganttGroups = useMemo<GanttGroup[]>(() => {
    if (kanbanColumns) return kanbanColumns.columns.map((c) => ({ key: c.key, label: c.label, icon: c.icon }));
    if (showProject) {
      const seen = new Map<string, string>();
      (shown ?? []).forEach((t) => seen.set(t.projectCode ?? "adm", t.projectCode ? `${t.projectCode} · ${t.projectTitle ?? ""}` : "Administrativo"));
      return [...seen.entries()].sort(([a], [b]) => (a === "adm" ? 1 : b === "adm" ? -1 : a.localeCompare(b))).map(([key, label]) => ({ key, label, icon: <Icon name={key === "adm" ? "adm" : "project"} size="sm" className="text-fg-subtle" /> }));
    }
    return TASK_STATUSES.map((s) => ({ key: s.key, label: s.label, icon: <TaskStatusIcon status={s.key} /> }));
  }, [kanbanColumns, showProject, shown]);

  if (view === "lista") return <TaskList tasks={shown} isLoading={isLoading} error={error} onRetry={onRetry} onOpen={onOpen} showProject={showProject} readOnly={readOnly} {...listProps} />;

  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  if (view === "kanban")
    return (
      <Kanban<TaskView, string>
        columns={columns.columns}
        items={shown}
        isLoading={isLoading}
        getId={(t) => t.id}
        getColumn={columns.getColumn}
        getPosition={(t) => t.position}
        // RN-78 — somente leitura ainda deixa o responsável arrastar a PRÓPRIA tarefa entre status (colunas customizadas, como área, mudam outros campos)
        canDrag={(t) => !readOnly || (!kanbanColumns && !!t.canChangeStatus)}
        renderCard={(t) => <TaskCard task={t} onOpen={onOpen} showProject={showProject} showStatus={!!kanbanColumns} />}
        onMove={move}
        onAdd={readOnly ? undefined : onAdd}
        emptyColumnText={columns.emptyColumnText ?? "Nenhuma tarefa"}
      />
    );

  if (isLoading || !shown)
    return (
      <div className="space-y-2 p-3 md:p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );

  const isGantt = view === "gantt";
  const withoutDate = shown.length - (isGantt ? ganttItems : calendarItems).length;

  return (
    <>
      {withoutDate > 0 && (
        <div className="flex items-center gap-2 px-3 pt-3 md:px-4">
          <Button size="sm" variant="outline" icon="viewList" disabled={!onViewChange} onClick={() => onViewChange?.("lista")}>
            {withoutDate === 1 ? "1 tarefa sem data" : `${withoutDate} tarefas sem data`}
            {onViewChange && <span className="text-fg-subtle"> · ver na lista</span>}
          </Button>
        </div>
      )}
      {!shown.length ? (
        <EmptyState icon={isGantt ? "viewGantt" : "viewCalendar"} title={emptyText ?? "Nenhuma tarefa para exibir"} description="Quando houver tarefas com data, elas aparecem aqui." />
      ) : isGantt ? (
        <Gantt items={ganttItems} groups={ganttGroups} labelHeader="Tarefa" emptyText="Nenhuma tarefa com data para exibir no Gantt." />
      ) : (
        <Calendar items={calendarItems} month={url.mes || monthKey(new Date())} onMonthChange={(mes) => setUrl({ mes })} emptyText="Nenhum prazo de tarefa neste mês." />
      )}
    </>
  );
}
