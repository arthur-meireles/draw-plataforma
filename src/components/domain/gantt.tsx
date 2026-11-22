"use client";
/**
 * Gantt genérico: linhas agrupadas, barras de início a fim, linha de hoje, atraso em cor de perigo,
 * rolagem horizontal. Reutilizável para projetos, tarefas e disponibilidade.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, SegmentedControl, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import { chipTone, startOfDay, type TimelineItem } from "./calendar";

export interface GanttGroup {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

type Zoom = "semana" | "mes";
const DAY_W: Record<Zoom, number> = { semana: 28, mes: 10 };
const DAY = 86_400_000;
const ROW_H = 36;
const LABEL_W = "w-40 md:w-60";
const LABEL_LEFT = "left-40 md:left-60";

export function Gantt({ items, groups, emptyText = "Nenhum item com datas para exibir." }: { items: TimelineItem[]; groups?: GanttGroup[]; emptyText?: string }) {
  const [zoom, setZoom] = useState<Zoom>("semana");
  const scroller = useRef<HTMLDivElement>(null);
  const dayW = DAY_W[zoom];

  const { origin, days } = useMemo(() => {
    const today = startOfDay(new Date().toISOString()).getTime();
    const starts = items.map((i) => startOfDay(i.start).getTime());
    const ends = items.map((i) => startOfDay(i.end).getTime());
    const min = Math.min(today - 14 * DAY, ...starts) - 5 * DAY;
    const max = Math.max(today + 45 * DAY, ...ends) + 10 * DAY;
    const o = new Date(min);
    o.setHours(0, 0, 0, 0);
    return { origin: o.getTime(), days: Math.ceil((max - o.getTime()) / DAY) };
  }, [items]);

  const todayX = ((startOfDay(new Date().toISOString()).getTime() - origin) / DAY) * dayW;

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = Math.max(0, todayX - 120);
  }, [todayX, zoom, items.length]);

  const rows = useMemo(() => {
    const keys = groups ? groups.map((g) => g.key) : [""];
    return keys.flatMap((k) => {
      const list = items.filter((i) => (groups ? (i.group ?? "") === k : true)).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      if (!list.length) return [];
      const g = groups?.find((x) => x.key === k);
      return [...(g ? [{ type: "group" as const, key: `g:${k}`, group: g, count: list.length }] : []), ...list.map((item) => ({ type: "item" as const, key: item.id, item }))];
    });
  }, [items, groups]);

  const months = useMemo(() => {
    const out: { label: string; left: number; width: number }[] = [];
    let cur = new Date(origin);
    while ((cur.getTime() - origin) / DAY < days) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const left = ((cur.getTime() - origin) / DAY) * dayW;
      const width = (Math.min((next.getTime() - origin) / DAY, days) - (cur.getTime() - origin) / DAY) * dayW;
      out.push({ label: cur.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }), left, width });
      cur = next;
    }
    return out;
  }, [origin, days, dayW]);

  const ticks = useMemo(() => {
    const step = zoom === "semana" ? 1 : 7;
    return Array.from({ length: Math.ceil(days / step) }, (_, i) => new Date(origin + i * step * DAY));
  }, [origin, days, zoom]);

  if (!items.length) return <EmptyState icon="viewGantt" title={emptyText} />;

  const width = days * dayW;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-2 px-3 py-2 md:px-4">
        <SegmentedControl aria-label="Escala do Gantt" value={zoom} onChange={setZoom} options={[{ value: "semana", label: "Dias" }, { value: "mes", label: "Semanas" }]} />
      </div>
      <div ref={scroller} className="mx-3 mb-4 min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-surface scrollbar-thin md:mx-4 max-md:mb-24">
        <div className="relative flex w-max flex-col">
          {/* cabeçalho */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-layer">
            <div className={cn("sticky left-0 z-30 shrink-0 border-r border-line bg-layer px-3 py-2 text-xs font-medium text-fg-subtle", LABEL_W)}>Projeto</div>
            <div className="relative h-12 shrink-0" style={{ width }}>
              {months.map((m) => (
                <div key={m.left} className="absolute top-0 h-6 truncate border-l border-line px-2 text-xs font-medium capitalize leading-6 text-fg-muted" style={{ left: m.left, width: m.width }}>
                  {m.label}
                </div>
              ))}
              {ticks.map((t, i) => (
                <div key={i} className="absolute top-6 h-6 border-l border-line/60 text-center text-2xs leading-6 tabular-nums text-fg-subtle" style={{ left: ((t.getTime() - origin) / DAY) * dayW, width: dayW * (zoom === "semana" ? 1 : 7) }}>
                  {t.getDate()}
                </div>
              ))}
            </div>
          </div>
          {/* corpo */}
          <div className="relative">
            <div className={cn("pointer-events-none absolute bottom-0 top-0 z-[5]", LABEL_LEFT)} style={{ width }}>
              <div className="absolute bottom-0 top-0 w-px bg-accent" style={{ left: todayX + dayW / 2 }}>
                <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-sm bg-accent px-1 text-2xs font-medium text-accent-fg">Hoje</span>
              </div>
            </div>
            {rows.map((r) =>
              r.type === "group" ? (
                <div key={r.key} className="flex h-8 border-b border-line bg-surface-2" style={{ minWidth: "100%" }}>
                  <div className={cn("sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface-2 px-3 text-sm font-medium text-fg", LABEL_W)}>
                    {r.group.icon}
                    <span className="truncate">{r.group.label}</span>
                    <span className="text-xs tabular-nums text-fg-subtle">{r.count}</span>
                  </div>
                </div>
              ) : (
                <GanttRow key={r.key} item={r.item} origin={origin} dayW={dayW} totalW={width} />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GanttRow({ item, origin, dayW, totalW }: { item: TimelineItem; origin: number; dayW: number; totalW: number }) {
  const s = startOfDay(item.start).getTime();
  const e = startOfDay(item.end).getTime();
  const left = ((s - origin) / DAY) * dayW;
  const w = Math.max(dayW, ((e - s) / DAY + 1) * dayW);
  const overdue = item.tone === "danger";
  const bar = (
    <span className={cn("absolute top-1.5 flex h-6 items-center overflow-hidden rounded-md border px-2 text-xs font-medium", chipTone[item.tone ?? "accent"], overdue && "border-danger")} style={{ left, width: w }}>
      <span className="truncate">{w > 90 ? item.title : ""}</span>
    </span>
  );
  const label = (
    <div className={cn("sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-surface px-3", LABEL_W)}>
      <span className="truncate text-sm text-fg">{item.title}</span>
      {item.meta && <span className="truncate text-2xs text-fg-subtle">{item.meta}</span>}
    </div>
  );
  const content = (
    <>
      {label}
      <div className="relative shrink-0" style={{ width: totalW }}>{bar}</div>
    </>
  );
  const cls = "flex border-b border-line hover:bg-layer-hover/50";
  const tip = `${item.title}${item.meta ? ` · ${item.meta}` : ""}`;
  return item.href ? (
    <Tooltip content={tip}>
      <Link href={item.href} className={cls} style={{ height: ROW_H }}>
        {content}
      </Link>
    </Tooltip>
  ) : (
    <div className={cls} style={{ height: ROW_H }} title={tip}>
      {content}
    </div>
  );
}
