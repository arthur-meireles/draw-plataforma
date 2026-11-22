"use client";
import { useMemo } from "react";
import { Calendar, Gantt, StageIcon, stageProgress, type GanttGroup, type TimelineItem } from "@/components/domain";
import { PROJECT_STAGES } from "@/data/reference";
import type { ProjectListItem } from "@/data/services";
import { daysUntil } from "@/lib/format";

const tone = (p: ProjectListItem): TimelineItem["tone"] => {
  if (p.isOverdue) return "danger";
  const d = daysUntil(p.dueAt);
  return d != null && d <= 2 ? "warning" : "accent";
};

const ymd = (iso: string) => iso.slice(0, 10);

/** Calendário mensal com os prazos dos projetos (agenda no celular). */
export function ProjectCalendarView({ projects, month, onMonthChange }: { projects: ProjectListItem[]; month: string; onMonthChange: (m: string) => void }) {
  const items = useMemo<TimelineItem[]>(
    () => projects.filter((p) => p.dueAt).map((p) => ({ id: p.id, title: `${p.code} ${p.title}`, start: p.dueAt!, end: p.dueAt!, href: `/projetos/${p.code}`, tone: tone(p), meta: p.clientName })),
    [projects],
  );
  const without = projects.length - items.length;
  return (
    <>
      <Calendar items={items} month={month} onMonthChange={onMonthChange} emptyText="Nenhum prazo neste mês." />
      {without > 0 && <p className="px-3 pb-4 text-xs text-fg-subtle md:px-4">{without === 1 ? "1 projeto sem prazo definido não aparece" : `${without} projetos sem prazo definido não aparecem`} no calendário.</p>}
    </>
  );
}

const groups: GanttGroup[] = PROJECT_STAGES.filter((s) => s.key !== "concluido").map((s) => ({ key: s.key, label: s.label, icon: <StageIcon category={s.category} progress={s.category === "open" ? stageProgress(s.key) : undefined} /> }));

/** Gantt de início a prazo, agrupado por etapa; atrasados em vermelho. */
export function ProjectGanttView({ projects }: { projects: ProjectListItem[] }) {
  const items = useMemo<TimelineItem[]>(
    () =>
      projects.flatMap((p) => {
        const start = p.startedAt ?? p.enteredAt;
        const end = p.dueAt ?? p.estimatedEndAt;
        if (!end) return [];
        return [{ id: p.id, title: `${p.code} ${p.title}`, start, end: ymd(end) < ymd(start) ? start : end, href: `/projetos/${p.code}`, tone: tone(p), meta: p.clientName, group: p.projectStageKey ?? "entrada" }];
      }),
    [projects],
  );
  return <Gantt items={items} groups={groups} emptyText="Nenhum projeto com prazo definido para exibir no Gantt." />;
}
