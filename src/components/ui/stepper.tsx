"use client";
/** Indicador de etapas de um assistente (wizard). Etapas concluídas são clicáveis para voltar. */
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export interface StepperItem {
  key: string;
  label: string;
}

export function Stepper({ steps, current, onSelect, className }: { steps: StepperItem[]; current: number; onSelect?: (index: number) => void; className?: string }) {
  return (
    <nav aria-label="Etapas" className={className}>
      {/* celular: resumo compacto */}
      <p className="text-xs text-fg-subtle md:hidden" aria-live="polite">
        Passo {current + 1} de {steps.length} · <span className="font-medium text-fg">{steps[current]?.label}</span>
      </p>
      <div className="mt-2 flex gap-1 md:hidden" aria-hidden>
        {steps.map((s, i) => (
          <span key={s.key} className={cn("h-1 flex-1 rounded-full", i <= current ? "bg-accent" : "bg-line-strong")} />
        ))}
      </div>
      <ol className="flex items-center gap-2 max-md:hidden">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!done}
                onClick={() => onSelect?.(i)}
                aria-current={active ? "step" : undefined}
                className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-sm", done && "cursor-pointer hover:bg-layer-hover", !done && "cursor-default")}
              >
                <span className={cn("flex size-5 items-center justify-center rounded-full text-2xs font-semibold tabular-nums", done ? "bg-accent text-accent-fg" : active ? "border border-accent bg-accent-subtle text-accent" : "border border-line-strong text-fg-subtle")}>
                  {done ? <Icon name="check" size="xs" /> : i + 1}
                </span>
                <span className={cn(active ? "font-medium text-fg" : "text-fg-subtle")}>{s.label}</span>
              </button>
              {i < steps.length - 1 && <span className="h-px w-8 bg-line-strong" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
