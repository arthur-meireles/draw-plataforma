"use client";
/** Faixa de indicadores do funil: cotações abertas, valor enviado, conversão e tempo médio (seção 12). */
import { Stat } from "@/components/ui";
import { Money } from "@/components/domain";
import { percent } from "@/lib/format";
import type { QuoteItem } from "@/data/services";
import { useCommercialIndicators } from "./use-quotes";

export function QuoteSummary({ items, loading }: { items: QuoteItem[] | undefined; loading?: boolean }) {
  const ind = useCommercialIndicators();
  const open = (items ?? []).filter((i) => i.status === "cotacao");
  const sentValue = open.filter((i) => i.column === "enviada" || i.column === "negociacao").reduce((a, i) => a + (i.proposalAmountCents ?? 0), 0);
  const waiting = open.filter((i) => i.column === "enviada" || i.column === "negociacao").length;
  const c = ind.data?.commercial;
  const median = c?.conversionDaysMedian;
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-line bg-surface-2 p-3 scrollbar-none md:grid md:grid-cols-2 md:gap-3 md:px-4 xl:grid-cols-4 [&>*]:max-md:min-w-52 [&>*]:max-md:shrink-0">
      <Stat label="Cotações abertas" icon="commercial" value={open.length} hint={`${waiting} aguardando o cliente`} loading={loading} />
      <Stat label="Em propostas enviadas" icon="money" tone="accent" value={<Money cents={sentValue} compact />} hint="Enviadas e em negociação" loading={loading} />
      <Stat label="Conversão (90 dias)" icon="target" tone="success" value={ind.isError ? "—" : percent(c?.conversionRate)} hint={c ? `${c.approved} de ${c.sent} propostas aprovadas` : ind.isError ? "Sem acesso aos indicadores" : undefined} loading={ind.isLoading} />
      <Stat label="Tempo médio de conversão" icon="time" tone="info" value={median != null ? `${Math.round(median)} dias` : "—"} hint="Do envio à aprovação" loading={ind.isLoading} />
    </div>
  );
}
