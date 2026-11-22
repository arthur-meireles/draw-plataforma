"use client";
/** Filtros do painel (período, tipo, responsável) → consulta de indicadores (RF-M8-03). */
import { useMemo } from "react";
import { useApiQuery } from "@/data/hooks";
import { metricsApi, type MetricsFilter } from "@/data/services";

export const PERIOD_OPTIONS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 180 dias" },
  { value: "365", label: "Últimos 12 meses" },
];

export interface PainelFilters {
  periodo: string;
  tipo: string | undefined;
  resp: string | undefined;
}

export function periodDays(periodo: string) {
  const n = Number(periodo);
  return [30, 90, 180, 365].includes(n) ? n : 90;
}

export function useIndicators(f: PainelFilters, enabled = true) {
  const days = periodDays(f.periodo);
  const filter = useMemo<MetricsFilter>(() => {
    const to = new Date();
    to.setHours(23, 59, 59, 0);
    const from = new Date(to.getTime() - days * 86_400_000);
    from.setHours(0, 0, 0, 0);
    return { from: from.toISOString(), to: to.toISOString(), projectTypeId: f.tipo, ownerId: f.resp };
  }, [days, f.tipo, f.resp]);
  // chave estável por dia: o filtro muda só quando período/tipo/responsável mudam
  const q = useApiQuery(["metrics", "indicators", days, f.tipo, f.resp, new Date().toDateString()], () => metricsApi.indicators(filter), { enabled });
  return q;
}

export const fmtDays = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")} dias`);
export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Altura de gráfico de barras horizontais conforme o número de linhas (rótulos sempre visíveis). */
export const rowsHeight = (rows = 0, per = 34) => Math.max(180, rows * per + 40);
