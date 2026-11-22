"use client";
import { TaskQuickAdd, TaskRow } from "@/components/domain";
import { Combobox, EmptyState, ErrorState, Pill, Skeleton } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { tasksApi, type TaskView } from "@/data/services";
import type { Sprint } from "@/data/types";

/** Backlog: tarefas sem sprint, com "Mover para sprint" em cada linha (RF-M6-01). */
export function BacklogList({ tasks, sprints, isLoading, error, onRetry, canEdit, onOpen }: { tasks: TaskView[] | undefined; sprints: Sprint[]; isLoading?: boolean; error?: { message?: string; status?: number } | null; onRetry?: () => void; canEdit: boolean; onOpen: (t: TaskView) => void }) {
  const move = useApiMutation(({ id, sprintId }: { id: string; sprintId: string }) => tasksApi.update(id, { sprintId }), { success: "Tarefa movida para a sprint" });
  const target = sprints.filter((s) => s.status !== "concluida");

  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isLoading || !tasks)
    return (
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>
    );

  return (
    <div>
      {tasks.length === 0 && <EmptyState compact icon="task" title="Backlog vazio" description="Tudo o que não está em uma sprint aparece aqui. Adicione uma tarefa para começar." />}
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center border-b border-line max-md:flex-wrap max-md:pb-2">
          <div className="min-w-0 flex-1 max-md:basis-full">
            <TaskRow task={t} onOpen={onOpen} readOnly={!canEdit} />
          </div>
          {canEdit && (
            <div className="shrink-0 pr-4 max-md:px-4">
              <Combobox
                options={target.map((s) => ({ value: s.id, label: s.name, description: s.status === "ativa" ? "Sprint atual" : "Planejada", icon: "sprint" }))}
                value={null}
                onChange={(v) => v && move.mutate({ id: t.id, sprintId: v })}
                align="end"
                emptyText="Crie uma sprint primeiro"
                contentClassName="w-64"
                trigger={
                  <Pill icon="sprint" aria-label={`Mover "${t.title}" para sprint`}>
                    Mover para sprint
                  </Pill>
                }
              />
            </div>
          )}
        </div>
      ))}
      {canEdit && <TaskQuickAdd module="adm" sprintId={null} label="Adicionar ao backlog" />}
    </div>
  );
}
