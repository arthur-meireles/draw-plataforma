"use client";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { dateFull } from "@/lib/format";
import type { ProjectDetail } from "./use-project";

/** Linha do tempo dos marcos de datas: entrada → proposta enviada → aprovação → início → prazo → conclusão. */
export function KeyDates({ project }: { project: ProjectDetail }) {
  const rows = [
    { key: "entrada", label: "Entrada", at: project.enteredAt },
    { key: "proposta", label: "Proposta enviada", at: project.quoteSentAt },
    { key: "aprovacao", label: "Aprovação", at: project.approvedAt },
    { key: "inicio", label: "Início", at: project.startedAt },
    { key: "prazo", label: "Prazo", at: project.dueAt, planned: true },
    { key: "conclusao", label: "Conclusão", at: project.completedAt },
  ];
  return (
    <ol className="grid gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">
      {rows.map((r) => {
        const done = !!r.at && !r.planned;
        const overdue = r.planned && !!r.at && !project.completedAt && new Date(r.at).getTime() < Date.now();
        return (
          <li key={r.key} className="flex min-w-0 items-start gap-2">
            <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", done ? "border-accent bg-accent-solid text-accent-fg" : r.planned && r.at ? (overdue ? "border-danger text-danger" : "border-accent text-accent") : "border-line-strong text-transparent")}>
              {done ? <Icon name="check" size="xs" /> : r.planned && r.at ? <Icon name="due" size="xs" /> : null}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-fg-subtle">{r.label}</p>
              <p className={cn("text-sm tabular-nums", r.at ? (overdue ? "font-medium text-danger" : "text-fg") : "text-fg-placeholder")}>{r.at ? dateFull(r.at) : "—"}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
