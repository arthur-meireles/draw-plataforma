"use client";
import { StageIcon } from "@/components/domain";
import { Button, IconButton, Input } from "@/components/ui";
import { PROJECT_STAGES } from "@/data/reference";
import type { ProjectStageKey } from "@/data/types";

export interface TemplateDraft {
  key: string;
  stageKey: ProjectStageKey;
  title: string;
  days: string;
}

let seq = 0;
export const newTemplateKey = () => `tpl_${Date.now().toString(36)}_${seq++}`;

/** Etapas que recebem tarefas-modelo (a etapa final não gera trabalho). */
const STAGES = PROJECT_STAGES.filter((s) => s.key !== "concluido");

/**
 * Editor de tarefas-modelo por etapa (RF-M2-05): adicionar, remover e reordenar.
 * Reordenar usa botões (acessível no celular); o `errors` vem por chave da linha.
 */
export function TaskTemplateEditor({ value, onChange, errors }: { value: TemplateDraft[]; onChange: (v: TemplateDraft[]) => void; errors: Record<string, { title?: string; days?: string }> }) {
  const patch = (key: string, p: Partial<TemplateDraft>) => onChange(value.map((t) => (t.key === key ? { ...t, ...p } : t)));
  const move = (stage: ProjectStageKey, key: string, dir: -1 | 1) => {
    const inStage = value.filter((t) => t.stageKey === stage);
    const i = inStage.findIndex((t) => t.key === key);
    const j = i + dir;
    if (j < 0 || j >= inStage.length) return;
    const swapped = [...inStage];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    // reaplica a ordem da etapa mantendo as demais
    let n = 0;
    onChange(value.map((t) => (t.stageKey === stage ? swapped[n++] : t)));
  };

  return (
    <div className="space-y-4">
      {STAGES.map((stage) => {
        const items = value.filter((t) => t.stageKey === stage.key);
        return (
          <section key={stage.key} aria-label={`Tarefas da etapa ${stage.label}`} className="overflow-hidden rounded-lg border border-line">
            <header className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
              <StageIcon category={stage.category} />
              <h3 className="text-sm font-medium text-fg">{stage.label}</h3>
              <span className="text-xs tabular-nums text-fg-subtle">{items.length}</span>
            </header>
            <ul className="divide-y divide-line">
              {items.map((t, i) => (
                <li key={t.key} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 p-2 md:grid-cols-[1fr_6rem_auto]">
                  <div className="col-span-2 md:col-span-1">
                    <Input value={t.title} onChange={(e) => patch(t.key, { title: e.target.value })} placeholder="Título da tarefa" aria-label={`Título da tarefa ${i + 1} em ${stage.label}`} invalid={!!errors[t.key]?.title} />
                    {errors[t.key]?.title && <p className="mt-1 text-xs text-danger">{errors[t.key].title}</p>}
                  </div>
                  <div>
                    <Input value={t.days} inputMode="numeric" onChange={(e) => patch(t.key, { days: e.target.value.replace(/\D/g, "").slice(0, 3) })} placeholder="Dias" aria-label={`Prazo em dias da tarefa ${i + 1} em ${stage.label}`} invalid={!!errors[t.key]?.days} suffix={<span className="pr-1.5 text-xs text-fg-subtle">dias</span>} className="pr-11" />
                    {errors[t.key]?.days && <p className="mt-1 text-xs text-danger">{errors[t.key].days}</p>}
                  </div>
                  <div className="flex items-start gap-0.5">
                    <IconButton icon="arrowUp" label="Subir tarefa" size="sm" disabled={i === 0} onClick={() => move(stage.key, t.key, -1)} />
                    <IconButton icon="arrowDown" label="Descer tarefa" size="sm" disabled={i === items.length - 1} onClick={() => move(stage.key, t.key, 1)} />
                    <IconButton icon="delete" label="Remover tarefa" size="sm" variant="destructive" onClick={() => onChange(value.filter((x) => x.key !== t.key))} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-2 py-1.5 first:border-t-0">
              <Button size="sm" variant="ghost" icon="add" onClick={() => onChange([...value, { key: newTemplateKey(), stageKey: stage.key, title: "", days: "3" }])}>
                Adicionar tarefa em {stage.label}
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
