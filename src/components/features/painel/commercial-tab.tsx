"use client";
/** Aba Comercial (RF-M8-03): conversão, origem e motivos de perda. */
import { BarSeriesChart, DonutChart, RankBars } from "@/components/domain";
import { number, plural } from "@/lib/format";
import { ChartSection } from "./chart-section";
import { IndicatorCard } from "./indicator-card";
import { fmtDays, fmtPct, type useIndicators } from "./use-indicators";

type Props = { q: ReturnType<typeof useIndicators> };

export function CommercialTab({ q }: Props) {
  const c = q.data?.commercial;
  const common = { loading: q.isLoading, error: q.error, onRetry: () => q.refetch() };
  const originTotal = c ? c.origin.cotacao + c.origin.direto : 0;
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <IndicatorCard loading={q.isLoading} icon="time" label="Tempo de conversão" value={fmtDays(c?.conversionDaysMedian)} formula="Mediana de (aprovação − envio da proposta)" />
        <IndicatorCard loading={q.isLoading} icon="target" tone="success" label="Taxa de conversão" value={fmtPct(c?.conversionRate)} hint={c ? `${c.approved} de ${plural(c.sent, "enviada", "enviadas")}` : undefined} formula="Aprovadas ÷ enviadas no período" />
        <IndicatorCard loading={q.isLoading} icon="send" tone="info" label="Propostas enviadas" value={c ? number(c.sent) : "—"} formula="Cotações com proposta enviada no período" />
        <IndicatorCard loading={q.isLoading} icon="approval" tone="violet" label="Propostas aprovadas" value={c ? number(c.approved) : "—"} formula="Enviadas no período que foram aprovadas" />
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <ChartSection
          {...common}
          title="Taxa de conversão por tipo"
          formula="Aprovadas ÷ enviadas, por tipo de projeto"
          empty={!c?.byType.length}
          csv={{ filename: "conversao-por-tipo", headers: ["Tipo", "Enviadas", "Aprovadas", "Taxa de conversão (%)"], rows: (c?.byType ?? []).map((r) => [r.label, r.sent, r.approved, Math.round(r.rate * 100)]) }}
        >
          <BarSeriesChart data={c?.byType ?? []} xKey="label" series={[{ key: "rate", label: "Taxa de conversão" }]} format="percent" />
        </ChartSection>
        <ChartSection
          {...common}
          title="Taxa de conversão por responsável"
          formula="Aprovadas ÷ enviadas, por responsável da proposta"
          empty={!c?.byOwner.length}
          csv={{ filename: "conversao-por-responsavel", headers: ["Responsável", "Enviadas", "Aprovadas", "Taxa de conversão (%)"], rows: (c?.byOwner ?? []).map((r) => [r.label, r.sent, r.approved, Math.round(r.rate * 100)]) }}
        >
          <RankBars items={(c?.byOwner ?? []).map((r) => ({ label: r.label, value: r.rate, sub: `${r.approved}/${r.sent}` }))} format="percent" max={1} />
        </ChartSection>
        <ChartSection
          {...common}
          title="Origem dos projetos"
          formula="% de projetos vindos de cotação × criados direto"
          empty={!originTotal}
          csv={{ filename: "origem-dos-projetos", headers: ["Origem", "Projetos"], rows: c ? [["Cotação", c.origin.cotacao], ["Direto", c.origin.direto]] : [] }}
        >
          <DonutChart
            data={[
              { label: "Cotação", value: c?.origin.cotacao ?? 0 },
              { label: "Direto", value: c?.origin.direto ?? 0 },
            ]}
            centerValue={String(originTotal)}
            centerLabel="projetos"
          />
        </ChartSection>
        <ChartSection
          {...common}
          title="Motivos de perda"
          formula="Cotações perdidas, agrupadas pelo motivo registrado"
          empty={!c?.lostReasons.length}
          emptyText="Nenhuma cotação perdida"
          csv={{ filename: "motivos-de-perda", headers: ["Motivo", "Cotações"], rows: (c?.lostReasons ?? []).map((r) => [r.reason, r.count]) }}
        >
          <RankBars items={[...(c?.lostReasons ?? [])].sort((a, b) => b.count - a.count).map((r) => ({ label: r.reason, value: r.count }))} />
        </ChartSection>
      </div>
    </div>
  );
}
