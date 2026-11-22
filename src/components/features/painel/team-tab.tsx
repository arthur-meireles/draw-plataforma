"use client";
/** Aba Equipe: atividade por pessoa (RF-M8-02) e carga com atrasos (RF-M8-04). */
import { Avatar, DataTable, EmptyState, ErrorState, Section, Skeleton, type Column } from "@/components/ui";
import { BarSeriesChart } from "@/components/domain";
import { useApiQuery } from "@/data/hooks";
import { metricsApi } from "@/data/services";
import { t } from "@/design/tokens";
import { relative } from "@/lib/format";
import { ExportCsvButton } from "./export-csv-button";
import { FormulaHint } from "./indicator-card";

type Activity = Awaited<ReturnType<typeof metricsApi.teamActivity>>[number];

const columns: Column<Activity>[] = [
  { id: "name", header: "Pessoa", mobile: "title", sortValue: (r) => r.name, cell: (r) => (
    <span className="flex items-center gap-2"><Avatar name={r.name} color={r.color} size="sm" />{r.name}</span>
  ) },
  { id: "events", header: "Ações", align: "right", sortValue: (r) => r.events, cell: (r) => <span className="tabular-nums">{r.events}</span> },
  { id: "tasks", header: "Tarefas concluídas", align: "right", sortValue: (r) => r.tasksCompleted, cell: (r) => <span className="tabular-nums">{r.tasksCompleted}</span> },
  { id: "comments", header: "Comentários", align: "right", sortValue: (r) => r.comments, cell: (r) => <span className="tabular-nums">{r.comments}</span> },
  { id: "last", header: "Última atividade", mobile: "meta", sortValue: (r) => r.lastAt, cell: (r) => <span className="text-fg-subtle">{r.lastAt ? relative(r.lastAt) : "—"}</span> },
];

export function TeamTab({ days }: { days: number }) {
  const back = Math.min(days, 90);
  const activity = useApiQuery(["metrics", "team-activity", back], () => metricsApi.teamActivity(back));
  const workload = useApiQuery(["metrics", "workload"], metricsApi.workload);
  const load = (workload.data ?? []).filter((w) => w.open > 0 || w.projects > 0).map((w) => ({ name: w.name, atrasadas: w.overdue, proximas: w.dueSoon, outras: Math.max(0, w.open - w.overdue - w.dueSoon), open: w.open }));

  return (
    <div className="space-y-4 md:space-y-6">
      <Section
        title="Atividade do time"
        icon="team"
        description={`Ações registradas, tarefas concluídas e comentários nos últimos ${back} dias`}
        bodyClassName="p-0"
        actions={<ExportCsvButton filename="atividade-do-time" headers={["Pessoa", "Ações", "Tarefas concluídas", "Comentários", "Última atividade"]} rows={(activity.data ?? []).map((r) => [r.name, r.events, r.tasksCompleted, r.comments, r.lastAt ?? ""])} />}
      >
        <DataTable
          rows={activity.data}
          columns={columns}
          getRowId={(r) => r.userId}
          isLoading={activity.isLoading}
          error={activity.error}
          onRetry={() => activity.refetch()}
          initialSort={{ id: "events", dir: "desc" }}
          dense
          empty={{ icon: "team", title: "Sem atividade no período", description: "As ações da equipe aparecem aqui assim que forem registradas." }}
        />
      </Section>

      <Section
        title="Carga por pessoa e por freelancer"
        icon="chart"
        description="Tarefas abertas, com prazo em até 7 dias e atrasadas"
        actions={<ExportCsvButton filename="carga-por-pessoa" headers={["Pessoa", "Tipo", "Projetos ativos", "Abertas", "Prazo em 7 dias", "Atrasadas", "Estimativa (h)"]} rows={(workload.data ?? []).map((w) => [w.name, w.kind === "interno" ? "Interno" : "Freelancer", w.projects, w.open, w.dueSoon, w.overdue, Number((w.estimateMinutes / 60).toFixed(1))])} />}
      >
        {workload.error ? (
          <ErrorState error={workload.error} onRetry={() => workload.refetch()} />
        ) : workload.isLoading ? (
          <Skeleton className="h-64" />
        ) : !load.length ? (
          <EmptyState compact icon="success" title="Ninguém com tarefas abertas" description="Quando houver tarefas atribuídas, a carga aparece aqui." />
        ) : (
          <>
            <p className="mb-2 text-xs text-fg-subtle"><FormulaHint formula="Tarefas abertas por responsável, com as vencidas em destaque" /></p>
            <BarSeriesChart
              data={load}
              xKey="name"
              horizontal
              stacked
              height={Math.max(200, load.length * 34 + 40)}
              series={[
                { key: "atrasadas", label: "Atrasadas", color: t.color.danger },
                { key: "proximas", label: "Prazo em 7 dias", color: t.color.warning },
                { key: "outras", label: "Demais abertas", color: t.color.accent },
              ]}
            />
          </>
        )}
      </Section>
    </div>
  );
}
