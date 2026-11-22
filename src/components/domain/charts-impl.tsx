"use client";
/** Implementação dos gráficos (Recharts). Carregada sob demanda por ./charts — nunca importe direto. */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { t } from "@/design/tokens";
import { moneyCompact, money, number } from "@/lib/format";

export interface Series {
  key: string;
  label: string;
  color?: string;
  /** Linha tracejada (ex.: ideal no burndown). */
  dashed?: boolean;
}

type Fmt = "money" | "number" | "percent" | "days";
const fmt = (v: number, f: Fmt) => (f === "money" ? moneyCompact(v) : f === "percent" ? `${Math.round(v * 100)}%` : f === "days" ? `${v.toFixed(0)}d` : number(v));
const fmtFull = (v: number, f: Fmt) => (f === "money" ? money(v) : f === "percent" ? `${(v * 100).toFixed(1)}%` : f === "days" ? `${v.toFixed(1)} dias` : number(v));

const axis = { stroke: "transparent", tick: { fill: "var(--fg-subtle)", fontSize: t.font.chartTick }, tickLine: false };

function ChartTooltip({ active, payload, label, format, labelFormat }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; format: Fmt; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-overlay">
      {label != null && <p className="mb-1 font-medium text-fg">{labelFormat ? labelFormat(String(label)) : label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-fg-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-3 font-medium tabular-nums text-fg">{fmtFull(Number(p.value), format)}</span>
        </p>
      ))}
    </div>
  );
}

const legendFormatter = (v: string) => <span className="text-xs text-fg-muted">{v}</span>;


export function BarSeriesChart<T extends Record<string, unknown>>({ data, xKey, series, format = "number", height = t.chart.height.md, stacked, xFormat, horizontal }: { data: T[]; xKey: keyof T & string; series: Series[]; format?: Fmt; height?: number; stacked?: boolean; xFormat?: (v: string) => string; horizontal?: boolean }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 8, bottom: 0, left: horizontal ? 8 : -8 }} barCategoryGap="24%">
          <CartesianGrid stroke={t.chart.grid} vertical={horizontal} horizontal={!horizontal} strokeDasharray="3 3" />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={(v) => fmt(v, format)} />
              <YAxis type="category" dataKey={xKey as never} {...axis} width={110} tickFormatter={xFormat} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey as never} {...axis} tickFormatter={xFormat} interval="preserveStartEnd" />
              <YAxis {...axis} tickFormatter={(v) => fmt(v, format)} width={56} />
            </>
          )}
          <Tooltip cursor={{ fill: "var(--layer-hover)" }} content={<ChartTooltip format={format} labelFormat={xFormat} />} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? t.chart.series[i % t.chart.series.length]} radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineSeriesChart<T extends Record<string, unknown>>({ data, xKey, series, format = "number", height = t.chart.height.md, xFormat, area }: { data: T[]; xKey: keyof T & string; series: Series[]; format?: Fmt; height?: number; xFormat?: (v: string) => string; area?: boolean }) {
  const Chart = area ? AreaChart : LineChart;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? t.chart.series[i]} stopOpacity={0.25} />
                <stop offset="100%" stopColor={s.color ?? t.chart.series[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={t.chart.grid} vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey={xKey as never} {...axis} tickFormatter={xFormat} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axis} tickFormatter={(v) => fmt(v, format)} width={56} />
          <Tooltip content={<ChartTooltip format={format} labelFormat={xFormat} />} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />}
          {series.map((s, i) =>
            area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? t.chart.series[i]} fill={`url(#grad-${s.key})`} strokeWidth={2} strokeDasharray={s.dashed ? "4 4" : undefined} connectNulls={false} dot={false} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? t.chart.series[i]} strokeWidth={2} strokeDasharray={s.dashed ? "4 4" : undefined} dot={false} connectNulls={false} />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, format = "number", height = t.chart.height.sm, centerLabel, centerValue }: { data: { label: string; value: number; color?: string }[]; format?: Fmt; height?: number; centerLabel?: string; centerValue?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex items-center gap-4 max-sm:flex-col">
      <div style={{ height, width: height }} className="relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.map((d, i) => (
                <Cell key={d.label} fill={d.color ?? t.chart.series[i % t.chart.series.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip format={format} />} />
          </PieChart>
        </ResponsiveContainer>
        {(centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold tabular-nums text-fg">{centerValue}</span>
            <span className="text-2xs text-fg-subtle">{centerLabel}</span>
          </div>
        )}
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ background: d.color ?? t.chart.series[i % t.chart.series.length] }} />
            <span className="min-w-0 flex-1 truncate text-fg-muted">{d.label}</span>
            <span className="tabular-nums text-fg">{fmt(d.value, format)}</span>
            <span className="w-9 text-right tabular-nums text-fg-subtle">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

