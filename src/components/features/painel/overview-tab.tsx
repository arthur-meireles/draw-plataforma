"use client";
/** Aba Visão geral (RF-M8-01): KPIs da gestão + resumo de indicadores do período. */
import { BarSeriesChart, monthLabel } from "@/components/domain";
import { HomeStats } from "@/components/features/inicio/home-stats";
import { ProjectsByStage } from "@/components/features/inicio/projects-by-stage";
import { t } from "@/design/tokens";
import { number } from "@/lib/format";
import { ChartSection } from "./chart-section";
import { IndicatorCard } from "./indicator-card";
import { fmtDays, fmtPct, type useIndicators } from "./use-indicators";

export function OverviewTab({ q }: { q: ReturnType<typeof useIndicators> }) {
  const d = q.data;
  const o = d?.operation;
  return (
    <div className="space-y-4 md:space-y-6">
      <HomeStats />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <IndicatorCard loading={q.isLoading} icon="target" tone="success" label="Taxa de conversão" value={fmtPct(d?.commercial.conversionRate)} formula="Aprovadas ÷ enviadas no período" />
        <IndicatorCard loading={q.isLoading} icon="time" label="Tempo de ciclo" value={fmtDays(o?.cycleDaysMedian)} formula="Mediana de (conclusão − início)" />
        <IndicatorCard loading={q.isLoading} icon="success" tone="info" label="Entregues no prazo" value={fmtPct(o?.onTimePct)} formula="% dos concluídos até o prazo estimado" />
        <IndicatorCard loading={q.isLoading} icon="client" tone="violet" label="Clientes recorrentes" value={d ? number(d.clients.recurring) : "—"} hint={d ? `de ${number(d.clients.total)} clientes com projeto` : undefined} formula="Clientes com mais de um projeto" />
      </div>
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <ProjectsByStage />
        <ChartSection
          title="Vazão por mês"
          formula="Projetos concluídos por mês (últimos 12 meses)"
          loading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          empty={!o?.throughput.some((m) => m.count)}
          emptyText="Nenhum projeto concluído nos últimos 12 meses"
          csv={{ filename: "vazao-por-mes", headers: ["Mês", "Projetos concluídos"], rows: (o?.throughput ?? []).map((m) => [m.month, m.count]) }}
        >
          <BarSeriesChart data={o?.throughput ?? []} xKey="month" xFormat={monthLabel} series={[{ key: "count", label: "Concluídos", color: t.color.success }]} />
        </ChartSection>
      </div>
    </div>
  );
}
