"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AvatarStack, Combobox, Icon, Input, Pill } from "@/components/ui";
import { DueChip, PriorityPill, ProjectCode, ProjectStageLabel, ProjectStatusBadge, ProjectTypeIcon, QuoteStageLabel, projectStageOptions, quoteStageOptions } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { projectsApi } from "@/data/services";
import type { ProjectStageKey, QuoteStageKey } from "@/data/types";
import { cn } from "@/lib/cn";
import { useCanEditProject, useProjectUpdate, type ProjectDetail } from "./use-project";

/** Título editável no próprio lugar (clique, Enter salva, Esc cancela). */
function InlineTitle({ value, editable, onSave }: { value: string; editable: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [error, setError] = useState<string>();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const commit = () => {
    const next = text.trim();
    if (!next) {
      setError("Dê um título ao projeto");
      return;
    }
    setError(undefined);
    setEditing(false);
    if (next !== value) onSave(next);
  };

  if (editing)
    return (
      <div>
        <Input
          ref={ref}
          value={text}
          invalid={!!error}
          aria-label="Título do projeto"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setText(value);
              setError(undefined);
              setEditing(false);
            }
          }}
          className="h-10 text-lg font-semibold"
        />
        {error && <p className="mt-1 text-xs text-danger" aria-live="polite">{error}</p>}
      </div>
    );
  return (
    <h1 className="min-w-0 text-lg font-semibold leading-snug text-fg md:text-xl">
      {editable ? (
        <button type="button" onClick={() => setEditing(true)} aria-label={`Editar título: ${value}`} className="group -mx-1.5 flex max-w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-layer-hover">
          <span className="break-words">{value}</span>
          <Icon name="edit" size="sm" className="shrink-0 text-fg-placeholder group-hover:text-fg-subtle" />
        </button>
      ) : (
        value
      )}
    </h1>
  );
}

/** Bloco de identidade do registro: código, tipo, título, cliente, etapa, prioridade, prazo e equipe. */
export function ProjectHeader({ project }: { project: ProjectDetail }) {
  const { isFreelancer } = usePermissions();
  const update = useProjectUpdate(project.id);
  const move = useApiMutation((stageKey: ProjectStageKey | QuoteStageKey) => projectsApi.move(project.id, { stageKey, position: project.position }), { success: "Etapa atualizada" });
  const editable = useCanEditProject(project);
  const done = project.status === "concluido" || project.status === "arquivado";

  const stagePill = (
    <Pill static={!editable} className="gap-1.5">
      {project.status === "cotacao" ? <QuoteStageLabel stageKey={project.quoteStageKey} /> : <ProjectStageLabel stageKey={project.projectStageKey} />}
    </Pill>
  );
  const canMoveStage = editable && (project.status === "ativo" || project.status === "cotacao");

  return (
    <div className="space-y-2.5 px-4 pb-3 pt-4 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <ProjectTypeIcon icon={project.typeIcon} size="sm" />
        <ProjectCode code={project.code} className="text-sm" />
        <ProjectStatusBadge status={project.status} />
        {project.isOverdue && <span className="text-xs font-medium text-danger">Atrasado</span>}
        {project.lostReason && (project.status === "perdido" || project.status === "cancelado" || project.status === "arquivado") && <span className="min-w-0 truncate text-xs text-fg-subtle">Motivo: {project.lostReason}</span>}
      </div>
      <InlineTitle value={project.title} editable={editable} onSave={(title) => update.mutate({ title })} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {isFreelancer ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
            <Icon name="client" size="sm" className="text-fg-subtle" />
            {project.clientName}
          </span>
        ) : (
          <Link href={`/clientes/${project.clientId}`} className="inline-flex items-center gap-1.5 rounded-md text-sm text-fg-muted hover:text-accent hover:underline">
            <Icon name="client" size="sm" className="text-fg-subtle" />
            {project.clientName}
          </Link>
        )}
        <span className="flex flex-wrap items-center gap-1.5">
          {canMoveStage ? (
            <Combobox
              options={project.status === "cotacao" ? quoteStageOptions(["aprovada", "perdida"]) : projectStageOptions(["concluido"])}
              value={project.status === "cotacao" ? project.quoteStageKey : project.projectStageKey}
              onChange={(v) => v && move.mutate(v)}
              trigger={stagePill}
              contentClassName="w-56"
              aria-label="Mudar etapa"
            />
          ) : (
            stagePill
          )}
          <PriorityPill value={project.priorityKey} onChange={editable ? (v) => update.mutate({ priorityKey: v }) : undefined} />
          <DueChip date={project.dueAt} done={done} />
        </span>
        <span className={cn("flex items-center gap-1.5 text-xs text-fg-subtle", !project.members.length && "hidden")}>
          <AvatarStack people={project.members.map((m) => ({ id: m.id, name: m.name, color: m.color }))} max={5} size="md" />
          <span>{project.members.length === 1 ? "1 pessoa" : `${project.members.length} pessoas`}</span>
        </span>
      </div>
    </div>
  );
}
