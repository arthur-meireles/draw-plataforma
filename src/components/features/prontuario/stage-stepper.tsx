"use client";
import { StageIcon, stageProgress } from "@/components/domain";
import { PROJECT_STAGES, QUOTE_STAGES } from "@/data/reference";
import { cn } from "@/lib/cn";
import type { ProjectDetail } from "./use-project";

/** Régua de etapas: do funil de cotação ou das etapas do projeto, destacando a atual (RF-M4-04). */
export function StageStepper({ project }: { project: ProjectDetail }) {
  const quote = project.status === "cotacao" || project.status === "perdido" || (project.origin === "cotacao" && !project.projectStageKey);
  const lost = project.status === "perdido";
  const stages = quote ? QUOTE_STAGES.filter((s) => s.key !== "perdida" || lost) : PROJECT_STAGES;
  const currentKey = quote ? project.quoteStageKey : project.projectStageKey;
  const currentIdx = Math.max(0, stages.findIndex((s) => s.key === currentKey));
  const finished = project.status === "concluido" || project.status === "arquivado";

  return (
    <ol aria-label="Etapas do projeto" className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
      {stages.map((s, i) => {
        const past = finished ? true : i < currentIdx;
        const current = !finished && i === currentIdx;
        return (
          <li key={s.key} aria-current={current ? "step" : undefined} className="flex min-w-[6.5rem] flex-1 flex-col gap-1.5">
            <span className={cn("h-1 rounded-full", past ? "bg-accent" : current ? (lost ? "bg-danger" : "bg-accent/60") : "bg-layer-active")} />
            <span className={cn("flex items-center gap-1.5 text-xs", current ? "font-medium text-fg" : past ? "text-fg-muted" : "text-fg-subtle")}>
              <StageIcon category={past ? "done" : s.category} progress={current && s.category === "open" ? (quote ? (s.order - 1) / 5 : stageProgress(s.key as never)) : undefined} size={12} />
              <span className="truncate">{s.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
