"use client";
import { useMemo } from "react";
import { useApiQuery } from "@/data/hooks";
import { commercialApi, metricsApi, type QuoteFilters } from "@/data/services";
import type { QuoteStageKey } from "@/data/types";
import { QUOTE_STAGES } from "@/data/reference";
import { useUrlState } from "@/lib/use-url-state";

export const PERIOD_OPTIONS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 6 meses" },
  { value: "365", label: "Últimos 12 meses" },
];

/** Filtros do funil persistidos na URL (RF-M3-06). */
export function useQuoteFilters() {
  const [state, set, activeCount] = useUrlState<{ visao?: string; etapa?: string; cliente?: string; resp?: string; tipo?: string; periodo?: string; q?: string }>({ visao: undefined, etapa: undefined, cliente: undefined, resp: undefined, tipo: undefined, periodo: undefined, q: undefined });
  const filters = useMemo<QuoteFilters>(
    () => ({
      stage: QUOTE_STAGES.some((s) => s.key === state.etapa) ? (state.etapa as QuoteStageKey) : undefined,
      clientId: state.cliente,
      ownerId: state.resp,
      projectTypeId: state.tipo,
      periodDays: state.periodo ? Number(state.periodo) : undefined,
      q: state.q,
    }),
    [state],
  );
  // a visão não conta como filtro
  const filterCount = activeCount - (state.visao ? 1 : 0);
  const clear = () => set({ etapa: undefined, cliente: undefined, resp: undefined, tipo: undefined, periodo: undefined, q: undefined });
  return { state, set, filters, filterCount, clear };
}

export const useQuotes = (filters: QuoteFilters) => useApiQuery(["commercial", "quotes", filters], () => commercialApi.quotes(filters));

/** Conversão e tempo médio (90 dias) a partir dos indicadores da gestão (seção 12). */
export function useCommercialIndicators() {
  const from = useMemo(() => new Date(Date.now() - 90 * 86_400_000).toISOString(), []);
  return useApiQuery(["metrics", "commercial", from], () => metricsApi.indicators({ from }), { retry: false });
}
