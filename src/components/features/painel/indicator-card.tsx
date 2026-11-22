"use client";
/** KPI do painel com a fórmula (seção 12) explicada em uma linha. */
import { Icon, Stat, Tooltip, type IconName, type Tone } from "@/components/ui";

export function IndicatorCard({ label, value, hint, formula, icon, tone, loading }: { label: string; value: React.ReactNode; hint?: React.ReactNode; formula: string; icon?: IconName; tone?: Tone; loading?: boolean }) {
  return (
    <Stat
      label={label}
      value={value}
      icon={icon}
      tone={tone}
      loading={loading}
      hint={
        <span className="flex min-w-0 flex-col gap-0.5">
          {hint && <span className="truncate text-fg-muted">{hint}</span>}
          <FormulaHint formula={formula} />
        </span>
      }
    />
  );
}

/** Texto curto da fórmula com ícone de informação (o texto completo fica no tooltip). */
export function FormulaHint({ formula }: { formula: string }) {
  return (
    <Tooltip content={formula}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <Icon name="info" size="xs" className="shrink-0" />
        <span className="truncate">{formula}</span>
      </span>
    </Tooltip>
  );
}
