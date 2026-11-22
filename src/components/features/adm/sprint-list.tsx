"use client";
import { useMemo, useState } from "react";
import { Badge, Button, ConfirmDialog, DataTable, Progress, RowActions, type Column } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { admExtraApi, tasksApi, type TaskView } from "@/data/services";
import type { Sprint, SprintStatus } from "@/data/types";
import { dateFull, plural } from "@/lib/format";

const STATUS: Record<SprintStatus, { label: string; tone: "neutral" | "accent" | "success" }> = {
  planejada: { label: "Planejada", tone: "neutral" },
  ativa: { label: "Em andamento", tone: "accent" },
  concluida: { label: "Concluída", tone: "success" },
};

export const SprintStatusBadge = ({ status }: { status: SprintStatus }) => (
  <Badge tone={STATUS[status].tone} dot>
    {STATUS[status].label}
  </Badge>
);

/** Lista de sprints com período, status, progresso e ações de iniciar/concluir (RF-M6-01). */
export function SprintList({ sprints, tasks, isLoading, error, onRetry, canEdit, onOpenBoard, onCreate }: { sprints: Sprint[] | undefined; tasks: TaskView[] | undefined; isLoading?: boolean; error?: { message?: string; status?: number } | null; onRetry?: () => void; canEdit: boolean; onOpenBoard: (s: Sprint) => void; onCreate: () => void }) {
  const [starting, setStarting] = useState<Sprint | null>(null);
  const [finishing, setFinishing] = useState<Sprint | null>(null);
  const start = useApiMutation((id: string) => tasksApi.setSprintStatus(id, "ativa"), { success: "Sprint iniciada", onSuccess: () => setStarting(null) });
  const finish = useApiMutation((id: string) => admExtraApi.finishSprint(id, "backlog"), {
    success: (r) => (r.moved ? `Sprint concluída · ${plural(r.moved, "tarefa voltou", "tarefas voltaram")} ao backlog` : "Sprint concluída"),
    onSuccess: () => setFinishing(null),
  });

  const stats = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    (tasks ?? []).forEach((t) => {
      if (!t.sprintId) return;
      const s = m.get(t.sprintId) ?? { total: 0, done: 0 };
      s.total++;
      if (t.statusKey === "concluida") s.done++;
      m.set(t.sprintId, s);
    });
    return m;
  }, [tasks]);

  const columns: Column<Sprint>[] = [
    { id: "name", header: "Sprint", mobile: "title", sortValue: (s) => s.name, cell: (s) => <span className="font-medium text-fg">{s.name}</span> },
    { id: "period", header: "Período", mobile: "subtitle", sortValue: (s) => s.startAt, cell: (s) => <span className="whitespace-nowrap text-fg-muted">{dateFull(s.startAt)} → {dateFull(s.endAt)}</span> },
    { id: "status", header: "Status", mobile: "trailing", sortValue: (s) => s.status, cell: (s) => <SprintStatusBadge status={s.status} /> },
    {
      id: "progress",
      header: "Progresso",
      hideBelow: "md",
      cell: (s) => {
        const st = stats.get(s.id) ?? { total: 0, done: 0 };
        return (
          <div className="flex w-40 items-center gap-2">
            <Progress value={st.done} max={st.total || 1} tone={st.total && st.done === st.total ? "success" : "accent"} label={`Progresso de ${s.name}`} />
            <span className="w-10 shrink-0 text-xs tabular-nums text-fg-subtle">{st.total ? Math.round((st.done / st.total) * 100) : 0}%</span>
          </div>
        );
      },
    },
    {
      id: "count",
      header: "Tarefas",
      align: "right",
      sortValue: (s) => stats.get(s.id)?.total ?? 0,
      cell: (s) => {
        const st = stats.get(s.id) ?? { total: 0, done: 0 };
        return <span className="text-fg-muted">{st.done}/{st.total}</span>;
      },
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      width: "9rem",
      cell: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canEdit && s.status === "planejada" && (
            <Button size="sm" variant="outline" icon="stageOpen" onClick={() => setStarting(s)}>
              Iniciar…
            </Button>
          )}
          {canEdit && s.status === "ativa" && (
            <Button size="sm" variant="outline" icon="check" onClick={() => setFinishing(s)}>
              Concluir…
            </Button>
          )}
          <RowActions
            label={`Ações de ${s.name}`}
            items={[
              { label: "Abrir quadro", icon: "viewKanban", onSelect: () => onOpenBoard(s) },
              { label: "Iniciar sprint…", icon: "stageOpen", hidden: !canEdit || s.status !== "planejada", onSelect: () => setStarting(s) },
              { label: "Concluir sprint…", icon: "check", hidden: !canEdit || s.status !== "ativa", onSelect: () => setFinishing(s) },
            ]}
          />
        </div>
      ),
    },
  ];

  const pending = finishing ? (stats.get(finishing.id)?.total ?? 0) - (stats.get(finishing.id)?.done ?? 0) : 0;
  const hasActive = (sprints ?? []).some((s) => s.status === "ativa");

  return (
    <>
      <DataTable
        rows={sprints ? [...sprints].sort((a, b) => b.startAt.localeCompare(a.startAt)) : undefined}
        columns={columns}
        getRowId={(s) => s.id}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        onRowClick={onOpenBoard}
        empty={{ icon: "sprint", title: "Nenhuma sprint ainda", description: "Crie a primeira sprint para planejar o ciclo das tarefas internas.", action: canEdit ? { label: "Nova sprint", icon: "add", onClick: onCreate } : undefined }}
      />
      <ConfirmDialog
        open={!!starting}
        onOpenChange={(o) => !o && setStarting(null)}
        title={`Iniciar ${starting?.name ?? "sprint"}?`}
        description={hasActive ? "A sprint em andamento será concluída e as tarefas não finalizadas dela voltam ao backlog." : "A sprint passa a ser a sprint atual e aparece no quadro."}
        confirmLabel="Iniciar sprint"
        loading={start.isPending}
        onConfirm={() => {
          if (!starting) return;
          const current = (sprints ?? []).find((s) => s.status === "ativa");
          if (current) finish.mutate(current.id, { onSuccess: () => start.mutate(starting.id) });
          else start.mutate(starting.id);
        }}
      />
      <ConfirmDialog
        open={!!finishing}
        onOpenChange={(o) => !o && setFinishing(null)}
        title={`Concluir ${finishing?.name ?? "sprint"}?`}
        description={pending > 0 ? `${plural(pending, "tarefa não foi concluída", "tarefas não foram concluídas")} e ${pending === 1 ? "volta" : "voltam"} ao backlog.` : "Todas as tarefas desta sprint estão concluídas."}
        confirmLabel="Concluir sprint"
        loading={finish.isPending}
        onConfirm={() => finishing && finish.mutate(finishing.id)}
      />
    </>
  );
}
