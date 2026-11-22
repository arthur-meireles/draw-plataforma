"use client";
import { AssigneePill, DueChip, Kanban, PriorityPill, TaskStatusIcon, TaskStatusPill, useTaskUpdate, type PersonRef } from "@/components/domain";
import { Icon, ProgressRing } from "@/components/ui";
import { TASK_STATUSES } from "@/data/reference";
import type { TaskView } from "@/data/services";
import type { TaskStatusKey } from "@/data/types";
import { cn } from "@/lib/cn";

const personOf = (t: TaskView): PersonRef | null => (t.assigneeUserId ? { kind: "user", id: t.assigneeUserId } : t.assigneeFreelancerId ? { kind: "freelancer", id: t.assigneeFreelancerId } : null);

/** Cartão de tarefa interna. `showStatus` mostra o status (útil no quadro por área, onde as colunas não são status). */
export function AdmTaskCard({ task: t, onOpen, showStatus }: { task: TaskView; onOpen: (t: TaskView) => void; showStatus?: boolean }) {
  const done = t.statusKey === "concluida";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(t)}
      className="cursor-pointer space-y-2.5 rounded-lg border border-line bg-surface p-3 shadow-raised transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised-2 focus-visible:border-accent focus-visible:outline-none"
    >
      <p className={cn("text-sm font-medium leading-snug text-fg", done && "text-fg-subtle line-through")}>{t.title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {showStatus && <TaskStatusPill value={t.statusKey} size="sm" />}
        <PriorityPill value={t.priorityKey} size="sm" />
        {t.dueAt && <DueChip date={t.dueAt} done={done} size="sm" />}
        {t.subtasksTotal > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
            <ProgressRing value={t.subtasksDone} max={t.subtasksTotal} />
            {t.subtasksDone}/{t.subtasksTotal}
          </span>
        )}
        {t.commentsCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-fg-subtle">
            <Icon name="comment" size="xs" />
            {t.commentsCount}
          </span>
        )}
        <span className="flex-1" />
        <AssigneePill value={personOf(t)} name={t.assigneeName} color={t.assigneeColor} size="sm" />
      </div>
    </div>
  );
}

/** Kanban da sprint por status da tarefa (RF-M6-01). Arrastar atualiza status e posição. */
export function SprintBoard({ tasks, isLoading, canEdit, onOpen, onAdd }: { tasks: TaskView[] | undefined; isLoading?: boolean; canEdit: boolean; onOpen: (t: TaskView) => void; onAdd?: (status: TaskStatusKey) => void }) {
  const update = useTaskUpdate();
  return (
    <Kanban<TaskView, TaskStatusKey>
      columns={TASK_STATUSES.map((s) => ({ key: s.key, label: s.label, icon: <TaskStatusIcon status={s.key} /> }))}
      items={tasks}
      isLoading={isLoading}
      getId={(t) => t.id}
      getColumn={(t) => t.statusKey}
      getPosition={(t) => t.position}
      canDrag={() => canEdit}
      renderCard={(t) => <AdmTaskCard task={t} onOpen={onOpen} />}
      onMove={(t, to) => update.mutate({ id: t.id, patch: { statusKey: to.column, position: to.position } })}
      onAdd={canEdit ? onAdd : undefined}
      emptyColumnText="Nenhuma tarefa"
    />
  );
}
