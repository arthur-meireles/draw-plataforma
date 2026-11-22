"use client";
import { cn } from "@/lib/cn";

export interface StatusChipOption<V extends string> {
  value: V;
  label: string;
  count?: number;
}

/** Faixa de chips de status com contagem (rola na horizontal no celular). `aria-pressed` indica o ativo. */
export function StatusChips<V extends string>({ value, onChange, options, label }: { value: V; onChange: (v: V) => void; options: StatusChipOption<V>[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors max-md:h-9",
              active ? "border-accent-line bg-accent-subtle text-accent" : "border-line text-fg-subtle hover:bg-layer-hover hover:text-fg",
            )}
          >
            {o.label}
            {o.count != null && <span className={cn("tabular-nums", active ? "text-accent" : "text-fg-placeholder")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
