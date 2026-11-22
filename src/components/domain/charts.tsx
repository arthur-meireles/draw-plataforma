"use client";
/**
 * Gráficos padronizados (Recharts + tokens), carregados SOB DEMANDA: o Recharts (~100 kB)
 * só baixa quando uma tela realmente mostra um gráfico (RNF-07 — primeira carga em 4G).
 * Telas nunca configuram Recharts direto.
 */
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui";
import type * as Impl from "./charts-impl";

export type { Series } from "./charts-impl";

/** Esqueleto com a altura dos gráficos (t.chart.height: md 240 = h-60, sm 180 = h-45). */
const placeholder = (size: "md" | "sm" = "md") =>
  function ChartLoading() {
    return <Skeleton className={size === "md" ? "h-60 w-full" : "h-45 w-full"} />;
  };

const LazyBar = dynamic(() => import("./charts-impl").then((m) => m.BarSeriesChart), { ssr: false, loading: placeholder() });
const LazyLine = dynamic(() => import("./charts-impl").then((m) => m.LineSeriesChart), { ssr: false, loading: placeholder() });
const LazyDonut = dynamic(() => import("./charts-impl").then((m) => m.DonutChart), { ssr: false, loading: placeholder("sm") });

type BarProps<T extends Record<string, unknown>> = Parameters<typeof Impl.BarSeriesChart<T>>[0];
type LineProps<T extends Record<string, unknown>> = Parameters<typeof Impl.LineSeriesChart<T>>[0];

export function BarSeriesChart<T extends Record<string, unknown>>(props: BarProps<T>) {
  return <LazyBar {...(props as unknown as ComponentProps<typeof LazyBar>)} />;
}
export function LineSeriesChart<T extends Record<string, unknown>>(props: LineProps<T>) {
  return <LazyLine {...(props as unknown as ComponentProps<typeof LazyLine>)} />;
}
export function DonutChart(props: ComponentProps<typeof LazyDonut>) {
  return <LazyDonut {...props} />;
}
export { RankBars } from "./rank-bars";

/** Rótulo de mês "2026-11" → "nov/26". */
export const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(". de ", "/").replace(".", "");
};
