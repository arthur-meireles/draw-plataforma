"use client";
import { useEffect, useState } from "react";
import { Button, Dialog, SelectField, TextareaField, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { RESOURCE_CATEGORY_LABEL } from "@/data/reference";
import { admApi } from "@/data/services";
import type { Resource, ResourceCategory } from "@/data/types";
import { focusFirstInvalid } from "@/lib/focus";

export const resourceCategoryOptions = (Object.keys(RESOURCE_CATEGORY_LABEL) as ResourceCategory[]).map((value) => ({ value, label: RESOURCE_CATEGORY_LABEL[value] }));

/** Cadastro/edição de recurso da biblioteca (RF-M6-04), com validação de URL. */
export function ResourceFormDialog({ open, onOpenChange, resource }: { open: boolean; onOpenChange: (o: boolean) => void; resource: Resource | null }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<ResourceCategory>("ferramenta");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setTitle(resource?.title ?? "");
    setUrl(resource?.url ?? "");
    setCategory(resource?.category ?? "ferramenta");
    setDescription(resource?.description ?? "");
    setErrors({});
  }, [open, resource]);

  const save = useApiMutation((v: Parameters<typeof admApi.saveResource>) => admApi.saveResource(...v), {
    success: resource ? "Recurso atualizado" : "Recurso adicionado",
    onSuccess: () => onOpenChange(false),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Informe o título";
    if (!/^https?:\/\/\S+\.\S+/.test(url.trim())) errs.url = "Use um link completo, começando com https://";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    save.mutate([{ title, url: url.trim(), category, description: description.trim() || null }, resource?.id]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={resource ? "Editar recurso" : "Novo recurso"}
      description="Ferramentas, templates, playbooks e referências da equipe."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => submit()}>
            {resource ? "Salvar alterações" : "Adicionar recurso"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Título" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <TextField label="Link" required type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} error={errors.url} placeholder="https://" />
        <SelectField label="Categoria" options={resourceCategoryOptions} value={category} onChange={(v) => v && setCategory(v)} />
        <TextareaField label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Para que serve e quando usar" />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
