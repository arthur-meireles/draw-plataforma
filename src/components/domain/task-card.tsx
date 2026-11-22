"use client";
/** Cartão compacto de tarefa para quadros (kanban): título, status opcional, prioridade, prazo, subtarefas, comentários e responsável. */
import { Icon, ProgressRing } from "@/components/ui";
import type { TaskView } from "@/data/services";
import { cn } from "@/lib/cn";
import { AssigneePill, type PersonRef } from "./pickers";
import { DueChip, PriorityPill, TaskStatusPill } from "./badges";

const personOf = (t: TaskView): PersonRef | null => (t.assigneeUserId ? { kind: "user", id: t.assigneeUserId } : t.assigneeFreelancerId ? { kind: "freelancer", id: t.assigneeFreelancerId } : null);

/** `showStatus` mostra o status (quando as colunas não são status); `showProject` mostra o código do projeto. */
export function TaskCard({ task: t, onOpen, showStatus, showProject }: { task: TaskView; onOpen: (t: TaskView) => void; showStatus?: boolean; showProject?: boolean }) {
  const done = t.statusKey === "concluida";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(t)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(t)}
      className="cursor-pointer space-y-2.5 rounded-lg border border-line bg-surface p-3 shadow-raised transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised-2 focus-visible:border-accent focus-visible:outline-none"
    >
      {showProject && t.projectCode && <p className="truncate font-display text-xs font-medium text-fg-subtle">{t.projectCode}{t.projectTitle ? ` · ${t.projectTitle}` : ""}</p>}
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
