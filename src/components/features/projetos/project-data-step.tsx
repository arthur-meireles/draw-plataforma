"use client";
import { DateField, SelectField, TextareaField, TextField } from "@/components/ui";
import { ClientField, PersonField, ProjectTypeField, priorityOptions } from "@/components/domain";
import { useProjectTypes } from "@/data/hooks";
import type { FieldErrors, WizardState } from "./project-wizard-model";

/** Etapa 2 — dados do projeto. Cada campo vai num `data-field` para foco no primeiro erro. */
export function ProjectDataStep({ state, patch, errors }: { state: WizardState; patch: (p: Partial<WizardState>) => void; errors: FieldErrors }) {
  const types = useProjectTypes();
  const prefix = types.data?.find((t) => t.id === state.projectTypeId)?.codePrefix;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div data-field="clientId">
        <ClientField value={state.clientId} onChange={(clientId) => patch({ clientId })} error={errors.clientId} />
      </div>
      <div data-field="projectTypeId">
        <ProjectTypeField value={state.projectTypeId} onChange={(projectTypeId) => patch({ projectTypeId })} error={errors.projectTypeId} />
        {prefix && <p className="mt-1.5 text-xs text-fg-subtle">O código será gerado automaticamente: <span className="font-mono text-fg-muted">{prefix}-NNN</span></p>}
      </div>
      <div data-field="title" className="md:col-span-2">
        <TextField label="Título do projeto" required value={state.title} onChange={(e) => patch({ title: e.target.value })} error={errors.title} placeholder="Ex.: Identidade visual — campanha de lançamento" maxLength={120} />
      </div>
      <div className="md:col-span-2">
        <TextareaField label="Briefing" value={state.briefing} onChange={(e) => patch({ briefing: e.target.value })} rows={4} hint="Contexto, objetivo e entregas esperadas. Opcional agora, dá para completar depois." />
      </div>
      <div data-field="ownerId">
        <PersonField label="Responsável" required internalOnly value={state.owner} onChange={(owner) => patch({ owner })} error={errors.ownerId} />
      </div>
      <SelectField label="Prioridade" options={priorityOptions} value={state.priority} onChange={(v) => v && patch({ priority: v })} />
      <div data-field="dueAt">
        <DateField label="Prazo" value={state.dueAt} onChange={(e) => patch({ dueAt: e.target.value })} error={errors.dueAt} hint="Opcional. Alimenta alertas, calendário e Gantt." />
      </div>
    </div>
  );
}
