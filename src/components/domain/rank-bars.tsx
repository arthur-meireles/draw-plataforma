"use client";
import { cn } from "@/lib/cn";
import { moneyCompact, number } from "@/lib/format";

type Fmt = "money" | "number" | "percent" | "days";
const fmt = (v: number, f: Fmt) => (f === "money" ? moneyCompact(v) : f === "percent" ? `${Math.round(v * 100)}%` : f === "days" ? `${v.toFixed(0)}d` : number(v));

/** Ranking em barras horizontais leves (HTML puro, ótimo no celular). */
export function RankBars({ items, format = "number", max: maxProp, className }: { items: { label: string; value: number; sub?: string; href?: string }[]; format?: Fmt; max?: number; className?: string }) {
  const max = maxProp ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((i) => (
        <li key={i.label} className="space-y-1">
          <div className="flex items-baseline gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-fg-muted">{i.label}</span>
            {i.sub && <span className="text-fg-subtle">{i.sub}</span>}
            <span className="font-medium tabular-nums text-fg">{fmt(i.value, format)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-layer-active">
            <div className="h-full rounded-full bg-accent-solid" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
