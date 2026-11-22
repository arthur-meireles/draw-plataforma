"use client";
/** Aba Burndown (RF-M8-05): subtarefas restantes por dia × linha ideal (tracejada). */
import { useEffect } from "react";
import { EmptyState, SelectField } from "@/components/ui";
import { LineSeriesChart } from "@/components/domain";
import { useApiQuery } from "@/data/hooks";
import { metricsApi, projectsApi } from "@/data/services";
import { t } from "@/design/tokens";
import { date } from "@/lib/format";
import { ChartSection } from "./chart-section";
import { IndicatorCard } from "./indicator-card";

export function BurndownTab({ projectId, onProjectChange }: { projectId: string | undefined; onProjectChange: (id: string | undefined) => void }) {
  const projects = useApiQuery(["projects", "active-options"], () => projectsApi.list({ status: ["ativo"] }));
  const first = projects.data?.[0]?.id;
  const current = projectId && projects.data?.some((p) => p.id === projectId) ? projectId : first;
  useEffect(() => {
    if (projectId && projects.data && !projects.data.some((p) => p.id === projectId)) onProjectChange(undefined);
  }, [projectId, projects.data, onProjectChange]);

  const q = useApiQuery(["metrics", "burndown", current], () => metricsApi.burndown(current!), { enabled: !!current });
  const d = q.data;
  const remaining = d ? d.total - d.done : null;
  const rows = (d?.points ?? []).map((p) => ({ ...p, day: p.date }));

  if (projects.data && !projects.data.length) return <EmptyState icon="project" title="Nenhum projeto ativo" description="O burndown aparece quando houver um projeto ativo com tarefas." />;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="max-w-md">
        <SelectField
          label="Projeto"
          value={current}
          onChange={(v) => onProjectChange(v ?? undefined)}
          options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.title}`, description: p.clientName }))}
          placeholder={projects.isLoading ? "Carregando projetos…" : "Escolha um projeto"}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <IndicatorCard loading={q.isLoading} icon="task" label="Tarefas" value={d?.total ?? "—"} formula="Total de tarefas do projeto" />
        <IndicatorCard loading={q.isLoading} icon="success" tone="success" label="Concluídas" value={d?.done ?? "—"} formula="Tarefas com status concluída" />
        <IndicatorCard loading={q.isLoading} icon="due" tone="warning" label="Restantes" value={remaining ?? "—"} formula="Total − concluídas" />
      </div>
      <ChartSection
        title="Burndown do projeto"
        formula="Tarefas restantes por dia até o prazo; a linha tracejada é o ritmo ideal"
        icon="chart"
        loading={projects.isLoading || q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        empty={!d || d.total === 0}
        emptyText="Este projeto ainda não tem tarefas"
        csv={{ filename: `burndown-${current ?? "projeto"}`, headers: ["Data", "Restantes", "Ideal"], rows: (d?.points ?? []).map((p) => [p.date.slice(0, 10), p.restantes, p.ideal]) }}
      >
        <LineSeriesChart data={rows} xKey="day" xFormat={(v) => date(v)} height={t.chart.height.lg} series={[{ key: "restantes", label: "Restantes" }, { key: "ideal", label: "Ideal", dashed: true, color: t.color.fgSubtle }]} />
      </ChartSection>
    </div>
  );
}
