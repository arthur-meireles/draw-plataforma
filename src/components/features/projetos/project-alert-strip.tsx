"use client";
import { Icon, Pill } from "@/components/ui";
import type { ProjectListItem } from "@/data/services";
import { plural } from "@/lib/format";
import { matchesDue } from "./use-project-filters";

/** Resumo de alertas (RF-M4-13): "3 atrasados · 5 vencem em 2 dias"; clicar filtra o quadro. */
export function ProjectAlertStrip({ projects, active, onSelect }: { projects: ProjectListItem[] | undefined; active: string; onSelect: (due: string) => void }) {
  if (!projects) return null;
  const overdue = projects.filter((p) => matchesDue(p, "atrasado")).length;
  const soon = projects.filter((p) => matchesDue(p, "proximos")).length;
  if (!overdue && !soon) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-surface-2 px-3 py-1.5 scrollbar-none md:px-4" role="region" aria-label="Alertas de prazo">
      <Icon name="warning" size="sm" className="shrink-0 text-warning" />
      {overdue > 0 && (
        <Pill tone="danger" onClick={() => onSelect(active === "atrasado" ? "" : "atrasado")} aria-pressed={active === "atrasado"} className={active === "atrasado" ? "ring-2 ring-danger/30" : ""}>
          {plural(overdue, "atrasado", "atrasados")}
        </Pill>
      )}
      {overdue > 0 && soon > 0 && <span className="text-fg-placeholder">·</span>}
      {soon > 0 && (
        <Pill tone="warning" onClick={() => onSelect(active === "proximos" ? "" : "proximos")} aria-pressed={active === "proximos"} className={active === "proximos" ? "ring-2 ring-warning/30" : ""}>
          {soon === 1 ? "1 vence" : `${soon} vencem`} em até 2 dias
        </Pill>
      )}
      <span className="hidden text-xs text-fg-subtle md:inline">Clique para filtrar</span>
    </div>
  );
}
