"use client";
/** Agenda semanal pessoal do freelancer (RF-M9-04): prazos de tarefas e entregas de projetos. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, EmptyState, Icon, IconButton, Section } from "@/components/ui";
import { ProjectCode, TaskStatusIcon } from "@/components/domain";
import type { ProjectListItem, TaskView } from "@/data/services";
import { cn } from "@/lib/cn";

const DAY = 86_400_000;
const startOfWeek = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7); // segunda-feira
  return d;
};
const sameDay = (iso: string, d: Date) => {
  const x = new Date(iso);
  return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
};

export function WeekAgenda({ tasks, projects, onOpenTask }: { tasks: TaskView[]; projects: ProjectListItem[]; onOpenTask: (t: TaskView) => void }) {
  const [offset, setOffset] = useState(0);
  const days = useMemo(() => {
    const s = startOfWeek(offset);
    return Array.from({ length: 7 }, (_, i) => new Date(s.getTime() + i * DAY));
  }, [offset]);
  const today = new Date();
  const label = `${days[0].toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}`;
  const items = days.map((d) => ({
    day: d,
    tasks: tasks.filter((t) => t.dueAt && sameDay(t.dueAt, d)),
    projects: projects.filter((p) => p.dueAt && sameDay(p.dueAt, d)),
  }));
  const total = items.reduce((a, i) => a + i.tasks.length + i.projects.length, 0);

  return (
    <Section
      title="Sua semana"
      icon="viewCalendar"
      description={label}
      actions={
        <>
          <IconButton icon="chevronLeft" label="Semana anterior" onClick={() => setOffset(offset - 1)} />
          <Button size="sm" variant="secondary" onClick={() => setOffset(0)} disabled={offset === 0}>
            Hoje
          </Button>
          <IconButton icon="chevronRight" label="Próxima semana" onClick={() => setOffset(offset + 1)} />
        </>
      }
      bodyClassName="p-0"
    >
      {total === 0 && <EmptyState compact icon="viewCalendar" title="Semana livre" description="Nenhum prazo nesta semana. Use a seta para ver as próximas." />}
      <div className={cn("grid divide-line max-lg:divide-y lg:grid-cols-7 lg:divide-x", total === 0 && "hidden")}>
        {items.map(({ day, tasks: ts, projects: ps }) => {
          const isToday = sameDay(today.toISOString(), day);
          return (
            <div key={day.toISOString()} className={cn("min-h-24 min-w-0 p-3 max-lg:flex max-lg:gap-3", isToday && "bg-accent-subtle/40")}>
              <div className="shrink-0 max-lg:w-14 lg:mb-2">
                <p className={cn("text-2xs font-medium uppercase text-fg-subtle", isToday && "text-accent")}>{day.toLocaleDateString("pt-BR", { weekday: "short" })}</p>
                <p className={cn("text-md font-semibold tabular-nums text-fg", isToday && "text-accent")}>{day.getDate()}</p>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {ps.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projetos/${p.code}`} className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning-subtle px-2 py-1.5 text-xs text-fg hover:border-warning">
                      <Icon name="delivery" size="xs" className="shrink-0 text-warning" />
                      <span className="min-w-0 truncate">
                        <ProjectCode code={p.code} /> entrega
                      </span>
                    </Link>
                  </li>
                ))}
                {ts.map((t) => (
                  <li key={t.id}>
                    <Button variant="ghost" size="sm" onClick={() => onOpenTask(t)} className="h-auto w-full justify-start gap-1.5 whitespace-normal rounded-md border border-line bg-layer-2 px-2 py-1.5 text-left text-xs font-normal">
                      <TaskStatusIcon status={t.statusKey} size={12} />
                      <span className={cn("min-w-0 flex-1", t.statusKey === "concluida" && "text-fg-subtle line-through")}>{t.title}</span>
                    </Button>
                  </li>
                ))}
                {!ts.length && !ps.length && <li className="text-xs text-fg-placeholder max-lg:hidden">—</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
