"use client";
/**
 * Calendário mensal genérico (projetos, tarefas, disponibilidade de freelancers).
 * Itens têm início e fim; aparecem em cada dia do intervalo. No celular vira agenda (lista por dia).
 */
import Link from "next/link";
import { useMemo } from "react";
import { Button, EmptyState, IconButton, Popover, PopoverContent, PopoverTrigger, type Tone } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface TimelineItem {
  id: string;
  title: string;
  /** ISO ou yyyy-mm-dd. */
  start: string;
  end: string;
  href?: string;
  tone?: Tone;
  /** Texto auxiliar (cliente, responsável…). */
  meta?: string;
  /** Agrupamento (usado pelo Gantt). */
  group?: string;
}

export const chipTone: Record<Tone, string> = {
  neutral: "bg-layer text-fg-muted border-line",
  accent: "bg-accent-subtle text-accent border-accent-line",
  success: "bg-success-subtle text-success border-transparent",
  warning: "bg-warning-subtle text-warning border-transparent",
  danger: "bg-danger-subtle text-danger border-transparent",
  info: "bg-info-subtle text-info border-transparent",
  violet: "bg-violet-subtle text-violet border-transparent",
  orange: "bg-warning-subtle text-orange border-transparent",
};

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const startOfDay = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const parseMonthKey = (k: string | undefined) => {
  const m = k?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
};

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const monthLabel = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

function ItemChip({ item, compact }: { item: TimelineItem; compact?: boolean }) {
  const cls = cn("flex min-w-0 items-center gap-1 rounded-sm border px-1.5 text-xs", compact ? "h-5" : "min-h-9 py-1.5 max-md:min-h-11", chipTone[item.tone ?? "accent"]);
  const body = (
    <>
      <span className="truncate font-medium">{item.title}</span>
      {!compact && item.meta && <span className="truncate opacity-70">· {item.meta}</span>}
    </>
  );
  return item.href ? (
    <Link href={item.href} className={cn(cls, "hover:brightness-95")} title={item.title}>
      {body}
    </Link>
  ) : (
    <span className={cls} title={item.title}>
      {body}
    </span>
  );
}

export interface CalendarProps {
  items: TimelineItem[];
  /** Mês exibido, "yyyy-mm". */
  month: string;
  onMonthChange: (month: string) => void;
  /** Texto quando o mês não tem itens. */
  emptyText?: string;
}

export function Calendar({ items, month, onMonthChange, emptyText = "Nada neste mês." }: CalendarProps) {
  const first = parseMonthKey(month);
  const today = dayKey(new Date());

  const byDay = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const it of items) {
      const s = startOfDay(it.start);
      const e = startOfDay(it.end);
      for (let d = new Date(s); d <= e && d.getTime() - s.getTime() < 120 * 86_400_000; d.setDate(d.getDate() + 1)) {
        const k = dayKey(d);
        map.set(k, [...(map.get(k) ?? []), it]);
      }
    }
    return map;
  }, [items]);

  const cells = useMemo(() => {
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [first]);

  const shift = (n: number) => onMonthChange(monthKey(new Date(first.getFullYear(), first.getMonth() + n, 1)));
  const monthDays = cells.filter((d) => d.getMonth() === first.getMonth());
  const agendaDays = monthDays.filter((d) => byDay.has(dayKey(d)));

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2 md:px-4">
        <IconButton icon="chevronLeft" label="Mês anterior" size="sm" onClick={() => shift(-1)} />
        <IconButton icon="chevronRight" label="Próximo mês" size="sm" onClick={() => shift(1)} />
        <h2 className="min-w-36 text-base font-semibold capitalize text-fg">{monthLabel(first)}</h2>
        <Button size="sm" variant="outline" onClick={() => onMonthChange(monthKey(new Date()))}>
          Hoje
        </Button>
      </div>

      {/* desktop/tablet: grade */}
      <div className="px-3 pb-4 max-md:hidden md:px-4">
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line bg-layer text-center text-xs font-medium uppercase text-fg-subtle">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1.5">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const k = dayKey(d);
              const list = byDay.get(k) ?? [];
              const inMonth = d.getMonth() === first.getMonth();
              const visible = list.slice(0, 3);
              return (
                <div key={k} className={cn("min-h-28 border-line p-1.5", i % 7 !== 6 && "border-r", i < cells.length - 7 && "border-b", !inMonth && "bg-layer/50")}>
                  <span className={cn("mb-1 inline-flex size-5 items-center justify-center rounded-full text-xs tabular-nums", k === today ? "bg-accent font-semibold text-accent-fg" : inMonth ? "text-fg-muted" : "text-fg-placeholder")}>{d.getDate()}</span>
                  <div className="flex flex-col gap-1">
                    {visible.map((it) => (
                      <ItemChip key={it.id} item={it} compact />
                    ))}
                    {list.length > 3 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="rounded-sm px-1 text-left text-xs text-fg-subtle hover:bg-layer-hover hover:text-fg">
                            +{list.length - 3} mais
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 space-y-1 p-2">
                          <p className="px-1 pb-1 text-xs font-medium text-fg-subtle">{d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}</p>
                          {list.map((it) => (
                            <ItemChip key={it.id} item={it} />
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* celular: agenda */}
      <div className="px-3 pb-4 md:hidden">
        {agendaDays.length === 0 ? (
          <EmptyState compact icon="viewCalendar" title={emptyText} />
        ) : (
          <ul className="space-y-3">
            {agendaDays.map((d) => (
              <li key={dayKey(d)}>
                <p className={cn("mb-1.5 text-xs font-medium capitalize", dayKey(d) === today ? "text-accent" : "text-fg-subtle")}>{d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" })}</p>
                <div className="flex flex-col gap-1.5">
                  {(byDay.get(dayKey(d)) ?? []).map((it) => (
                    <ItemChip key={it.id} item={it} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
