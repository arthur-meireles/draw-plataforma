"use client";
/** Tempo mediano por etapa; a etapa mais lenta (gargalo) fica destacada. */
import { Badge, Progress } from "@/components/ui";
import { fmtDays } from "./use-indicators";

export interface StageTime {
  key: string;
  label: string;
  days: number;
  samples: number;
}

export function StageTimeBars({ items }: { items: StageTime[] }) {
  const measured = items.filter((i) => i.samples > 0);
  const slowest = measured.length ? measured.reduce((a, b) => (b.days > a.days ? b : a)) : null;
  const max = Math.max(1, ...items.map((i) => i.days));
  return (
    <ul className="space-y-3">
      {items.map((i) => {
        const bottleneck = slowest?.key === i.key;
        return (
          <li key={i.key} className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span className={bottleneck ? "font-medium text-fg" : "text-fg-muted"}>{i.label}</span>
              {bottleneck && (
                <Badge tone="danger" icon="warning" size="xs">
                  Gargalo
                </Badge>
              )}
              <span className="flex-1" />
              <span className="tabular-nums text-fg-subtle">{i.samples ? `${i.samples} ${i.samples === 1 ? "passagem" : "passagens"}` : "sem dados"}</span>
              <span className="w-20 text-right font-medium tabular-nums text-fg">{i.samples ? fmtDays(i.days) : "—"}</span>
            </div>
            <Progress value={i.days} max={max} tone={bottleneck ? "danger" : "accent"} label={`${i.label}: ${fmtDays(i.days)}`} />
          </li>
        );
      })}
    </ul>
  );
}
