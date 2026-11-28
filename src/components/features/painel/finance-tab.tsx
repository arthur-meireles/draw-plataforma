"use client";
/** Aba Financeiro (RF-M8-03): receita, margem, ticket e custo de freelancers. Só para quem vê valores. */
import { BarSeriesChart, Money, RankBars, monthLabel } from "@/components/domain";
import { t } from "@/design/tokens";
import { number, plural } from "@/lib/format";
import { ChartSection } from "./chart-section";
import { IndicatorCard } from "./indicator-card";
import { fmtPct, type useIndicators } from "./use-indicators";

const reais = (cents: number) => Number((cents / 100).toFixed(2));

export function FinanceTab({ q }: { q: ReturnType<typeof useIndicators> }) {
  const f = q.data?.finance;
  const cl = q.data?.clients;
  const common = { loading: q.isLoading, error: q.error, onRetry: () => q.refetch() };
  const marginPct = f && f.contractedTotal ? f.marginTotal / f.contractedTotal : null;
  const ticketAvg = f ? (f.marginByType.reduce((a, r) => a + r.count, 0) ? f.contractedTotal / f.marginByType.reduce((a, r) => a + r.count, 0) : 0) : null;
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <IndicatorCard loading={q.isLoading} icon="money" href="/financeiro/visao-geral" label="Contratado" value={<Money cents={f?.contractedTotal} compact />} formula="Valor contratado dos projetos aprovados no período (tipo e responsável do filtro)" />
        <IndicatorCard loading={q.isLoading} icon="margin" tone="success" label="Margem" value={<Money cents={f?.marginTotal} compact />} hint={marginPct != null ? `${fmtPct(marginPct)} do contratado` : undefined} formula="Receita (contratado + adicionais) − impostos − custos dos projetos aprovados no período (RN-65)" />
        <IndicatorCard loading={q.isLoading} icon="invoice" href="/financeiro/receber?status=faturado" label="Faturado no período" value={<Money cents={f?.invoicedInPeriod} compact />} formula="NFs emitidas no período (data de emissão)" />
        <IndicatorCard loading={q.isLoading} icon="receivable" tone="success" href="/financeiro/receber?status=recebido" label="Recebido no período" value={<Money cents={f?.receivedInPeriod} compact />} formula="Baixas registradas no período (data do recebimento)" />
        <IndicatorCard loading={q.isLoading} icon="target" tone="info" label="Ticket médio" value={<Money cents={ticketAvg} compact />} formula="Contratado médio por projeto" />
        <IndicatorCard loading={q.isLoading} icon="client" tone="violet" label="Clientes recorrentes" value={cl ? number(cl.recurring) : "—"} hint={cl ? `${cl.projectsPerClient.toFixed(1).replace(".", ",")} projetos por cliente · ${plural(cl.total, "cliente", "clientes")}` : undefined} formula="Clientes com mais de um projeto" />
      </div>

      <ChartSection
        {...common}
        title="Receita por mês"
        formula="Contratado (aprovação), faturado (emissão) e recebido (pagamento), meses do período"
        empty={!f?.revenueByMonth.some((m) => m.contratado || m.faturado || m.recebido)}
        emptyText="Sem movimentação no período"
        csv={{ filename: "receita-por-mes", headers: ["Mês", "Contratado (R$)", "Faturado (R$)", "Recebido (R$)"], rows: (f?.revenueByMonth ?? []).map((m) => [m.month, reais(m.contratado), reais(m.faturado), reais(m.recebido)]) }}
      >
        <BarSeriesChart data={f?.revenueByMonth ?? []} xKey="month" xFormat={monthLabel} format="money" height={t.chart.height.lg} series={[{ key: "contratado", label: "Contratado" }, { key: "faturado", label: "Faturado" }, { key: "recebido", label: "Recebido", color: t.color.success }]} />
      </ChartSection>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <ChartSection
          {...common}
          title="Margem por tipo"
          formula="Margem (RN-65) dos projetos aprovados no período, por tipo"
          empty={!f?.marginByType.length}
          csv={{ filename: "margem-por-tipo", headers: ["Tipo", "Projetos", "Contratado (R$)", "Margem (R$)", "Margem (%)"], rows: (f?.marginByType ?? []).map((r) => [r.label, r.count, reais(r.contracted), reais(r.margin), Math.round(r.marginPct * 100)]) }}
        >
          <RankBars items={[...(f?.marginByType ?? [])].sort((a, b) => b.margin - a.margin).map((r) => ({ label: r.label, value: Math.max(0, r.margin), sub: fmtPct(r.marginPct) }))} format="money" />
        </ChartSection>
        <ChartSection
          {...common}
          title="Ticket médio por tipo"
          formula="Contratado médio por projeto, por tipo"
          empty={!f?.marginByType.length}
          csv={{ filename: "ticket-por-tipo", headers: ["Tipo", "Projetos", "Ticket médio (R$)"], rows: (f?.marginByType ?? []).map((r) => [r.label, r.count, reais(r.ticket)]) }}
        >
          <RankBars items={[...(f?.marginByType ?? [])].sort((a, b) => b.ticket - a.ticket).map((r) => ({ label: r.label, value: r.ticket, sub: plural(r.count, "projeto", "projetos") }))} format="money" />
        </ChartSection>
        <ChartSection
          {...common}
          title="Ticket médio por cliente"
          formula="Contratado médio por projeto, 10 maiores clientes"
          empty={!f?.ticketByClient.length}
          csv={{ filename: "ticket-por-cliente", headers: ["Cliente", "Projetos", "Contratado (R$)", "Ticket médio (R$)", "Margem (R$)"], rows: (f?.ticketByClient ?? []).map((r) => [r.label, r.count, reais(r.contracted), reais(r.ticket), reais(r.margin)]) }}
        >
          <RankBars items={(f?.ticketByClient ?? []).map((r) => ({ label: r.label, value: r.ticket, sub: plural(r.count, "projeto", "projetos") }))} format="money" />
        </ChartSection>
        <ChartSection
          {...common}
          title="Custo de freelancers"
          formula="Contas a pagar de freelancers dos projetos aprovados no período, por pessoa"
          empty={!f?.freelancerCost.length}
          emptyText="Nenhum custo de freelancer"
          csv={{ filename: "custo-de-freelancers", headers: ["Freelancer", "Pagamentos", "Total (R$)"], rows: (f?.freelancerCost ?? []).map((r) => [r.label, r.count, reais(r.total)]) }}
        >
          <RankBars items={(f?.freelancerCost ?? []).map((r) => ({ label: r.label, value: r.total, sub: plural(r.count, "pagamento", "pagamentos") }))} format="money" />
        </ChartSection>
      </div>
    </div>
  );
}
