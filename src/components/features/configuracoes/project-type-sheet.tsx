"use client";
import { useEffect, useState } from "react";
import { Button, Callout, Section, Sheet, Switch, TextareaField, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { PROJECT_STAGES } from "@/data/reference";
import { projectTypesApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";
import { IconPicker } from "./icon-picker";
import { newTemplateKey, TaskTemplateEditor, type TemplateDraft } from "./task-template-editor";

export type ProjectTypeRow = Awaited<ReturnType<typeof projectTypesApi.list>>[number];

const stageOrder = (k: string) => PROJECT_STAGES.find((s) => s.key === k)?.order ?? 99;

/** Editor de tipo de projeto (RF-M2-05): dados do tipo + tarefas-modelo por etapa. `type = null` cria um novo. */
export function ProjectTypeSheet({ open, type, onClose, readOnly }: { open: boolean; type: ProjectTypeRow | null; onClose: () => void; readOnly?: boolean }) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [icon, setIcon] = useState("folder");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [templates, setTemplates] = useState<TemplateDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tplErrors, setTplErrors] = useState<Record<string, { title?: string; days?: string }>>({});

  useEffect(() => {
    if (!open) return;
    setName(type?.name ?? "");
    setPrefix(type?.codePrefix ?? "");
    setIcon(type?.icon ?? "folder");
    setDescription(type?.description ?? "");
    setActive(type?.active ?? true);
    setTemplates((type?.templates ?? []).map((t) => ({ key: newTemplateKey(), stageKey: t.stageKey, title: t.title, days: String(t.defaultDurationDays), role: t.defaultRole ?? "" })));
    setErrors({});
    setTplErrors({});
  }, [open, type]);

  const locked = !!type && type.projectsCount > 0;

  const save = useApiMutation((input: Parameters<typeof projectTypesApi.save>[0]) => projectTypesApi.save(input, type?.id), {
    success: type ? "Tipo de projeto atualizado" : "Tipo de projeto criado",
    onSuccess: onClose,
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Informe o nome, ex.: Memorial descritivo";
    if (!/^[A-Za-z]{2,5}$/.test(prefix.trim())) errs.codePrefix = "Use de 2 a 5 letras, ex.: MEM";
    const te: typeof tplErrors = {};
    templates.forEach((t) => {
      if (!t.title.trim()) te[t.key] = { ...te[t.key], title: "Dê um título à tarefa" };
      if (t.days === "" || Number(t.days) < 0) te[t.key] = { ...te[t.key], days: "Informe os dias" };
    });
    setErrors(errs);
    setTplErrors(te);
    if (Object.keys(errs).length || Object.keys(te).length) return focusFirstInvalid();
    const ordered = [...templates].sort((a, b) => stageOrder(a.stageKey) - stageOrder(b.stageKey));
    save.mutate({ name, codePrefix: prefix, description: description.trim() || null, icon, active, templates: ordered.map((t) => ({ stageKey: t.stageKey, title: t.title.trim(), defaultDurationDays: Number(t.days), defaultRole: t.role || null })) });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width="lg"
      title={type ? `Tipo de projeto · ${type.name}` : "Novo tipo de projeto"}
      ariaTitle="Editor de tipo de projeto"
      footer={
        readOnly ? (
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={submit}>
              {type ? "Salvar tipo" : "Criar tipo"}
            </Button>
          </>
        )
      }
    >
      <fieldset disabled={readOnly || save.isPending} className="min-w-0 space-y-5 p-4 md:p-6">
        <Section title="Dados do tipo" icon="tag">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <TextField label="Nome" required autoFocus value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
              <TextField label="Prefixo do código" required value={prefix} maxLength={5} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} error={errors.codePrefix} disabled={locked} hint={locked ? "Travado: já existem projetos." : `Gera ${(prefix || "MEM").toUpperCase()}-001`} className="font-mono uppercase" />
            </div>
            {locked && <Callout tone="info" title="Prefixo travado (RN-05)">Há {type!.projectsCount} {type!.projectsCount === 1 ? "projeto" : "projetos"} com este tipo. Mudar o prefixo quebraria os códigos já emitidos.</Callout>}
            <IconPicker value={icon} onChange={setIcon} />
            <TextareaField label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Quando usar este tipo de projeto" />
            <Switch checked={active} onCheckedChange={setActive} label="Ativo" description="Tipos inativos não aparecem ao criar projetos, mas os projetos existentes continuam." />
          </div>
        </Section>
        <Section title="Tarefas-modelo por etapa" description="Criadas automaticamente quando a proposta é aprovada. O prazo em dias conta a partir da entrada na etapa." icon="task">
          <TaskTemplateEditor value={templates} onChange={setTemplates} errors={tplErrors} />
        </Section>
      </fieldset>
    </Sheet>
  );
}
