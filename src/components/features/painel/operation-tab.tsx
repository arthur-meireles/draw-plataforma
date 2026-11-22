"use client";
/** Aba Operação (RF-M8-03): ciclo, prazo, gargalo, vazão, em andamento e atraso. */
import { BarSeriesChart, monthLabel } from "@/components/domain";
import { t } from "@/design/tokens";
import { number } from "@/lib/format";
import { ChartSection } from "./chart-section";
import { IndicatorCard } from "./indicator-card";
import { StageTimeBars } from "./stage-time-bars";
import { fmtDays, fmtPct, type useIndicators } from "./use-indicators";

export function OperationTab({ q }: { q: ReturnType<typeof useIndicators> }) {
  const o = q.data?.operation;
  const common = { loading: q.isLoading, error: q.error, onRetry: () => q.refetch() };
  const dev = o?.deviationDaysMedian;
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <IndicatorCard loading={q.isLoading} icon="time" label="Tempo de ciclo" value={fmtDays(o?.cycleDaysMedian)} formula="Mediana de (conclusão − início)" />
        <IndicatorCard loading={q.isLoading} icon="success" tone="success" label="Entregues no prazo" value={fmtPct(o?.onTimePct)} formula="% dos concluídos até o prazo estimado" />
        <IndicatorCard loading={q.isLoading} icon="due" tone={dev != null && dev > 0 ? "warning" : "success"} label="Desvio do prazo" value={dev == null ? "—" : `${dev > 0 ? "+" : ""}${dev.toFixed(1).replace(".", ",")} dias`} hint={dev == null ? undefined : dev > 0 ? "Entregamos depois do estimado" : "Entregamos antes do estimado"} formula="Mediana de (conclusão − prazo estimado)" />
        <IndicatorCard loading={q.isLoading} icon="warning" tone={o?.overduePct ? "danger" : "success"} label="Tarefas em atraso" value={fmtPct(o?.overduePct)} hint={o ? `${number(o.openTasks)} tarefas abertas` : undefined} formula="Tarefas vencidas ÷ tarefas abertas" />
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <ChartSection
          {...common}
          title="Ciclo por tipo de projeto"
          formula="Mediana de (conclusão − início), por tipo"
          empty={!o?.cycleByType.length}
          emptyText="Nenhum projeto concluído no período"
          csv={{ filename: "ciclo-por-tipo", headers: ["Tipo", "Ciclo mediano (dias)", "Projetos concluídos"], rows: (o?.cycleByType ?? []).map((r) => [r.label, Number(r.days.toFixed(1)), r.count]) }}
        >
          <BarSeriesChart data={o?.cycleByType ?? []} xKey="label" series={[{ key: "days", label: "Ciclo mediano" }]} format="days" />
        </ChartSection>
        <ChartSection
          {...common}
          title="Tempo por etapa e gargalo"
          formula="Tempo entre eventos de mudança de etapa; a mais lenta é o gargalo"
          empty={!o?.stageTime.some((s) => s.samples)}
          emptyText="Ainda sem mudanças de etapa registradas"
          skeletonHeight="h-72"
          csv={{ filename: "tempo-por-etapa", headers: ["Etapa", "Tempo mediano (dias)", "Passagens"], rows: (o?.stageTime ?? []).map((s) => [s.label, Number(s.days.toFixed(1)), s.samples]) }}
        >
          <StageTimeBars items={o?.stageTime ?? []} />
        </ChartSection>
        <ChartSection
          {...common}
          title="Vazão por mês"
          formula="Projetos concluídos por mês (últimos 12 meses)"
          empty={!o?.throughput.some((m) => m.count)}
          emptyText="Nenhum projeto concluído nos últimos 12 meses"
          csv={{ filename: "vazao-por-mes", headers: ["Mês", "Projetos concluídos"], rows: (o?.throughput ?? []).map((m) => [m.month, m.count]) }}
        >
          <BarSeriesChart data={o?.throughput ?? []} xKey="month" xFormat={monthLabel} series={[{ key: "count", label: "Concluídos", color: t.color.success }]} />
        </ChartSection>
        <ChartSection
          {...common}
          title="Em andamento por etapa"
          formula="Projetos e tarefas abertos em cada etapa"
          empty={!o?.wip.some((w) => w.projects || w.tasks)}
          emptyText="Nada em andamento"
          csv={{ filename: "em-andamento-por-etapa", headers: ["Etapa", "Projetos", "Tarefas abertas"], rows: (o?.wip ?? []).map((w) => [w.label, w.projects, w.tasks]) }}
        >
          <BarSeriesChart data={o?.wip ?? []} xKey="label" series={[{ key: "projects", label: "Projetos" }, { key: "tasks", label: "Tarefas" }]} />
        </ChartSection>
      </div>
    </div>
  );
}
