"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, DateField, Dialog, SelectField, TextField, useSuccessFlash, type Option } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { projectsApi, tasksApi } from "@/data/services";
import { fromDateInput } from "@/lib/format";

const ADM = "adm";

/**
 * Criação rápida em "Minhas tarefas" (RF-M4-08): escolhe onde (projeto ativo/cotação visível ou Administrativo,
 * conforme a permissão), título e prazo; a tarefa já nasce atribuída a quem cria.
 */
export function NewMyTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user, canWrite, canWriteAll } = usePermissions();
  const projects = useApiQuery(["projects", "list", "task-targets"], () => projectsApi.list({ status: ["ativo", "cotacao"] }), { enabled: open });
  const [where, setWhere] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ok = useSuccessFlash();

  useEffect(() => {
    if (!open) return;
    setWhere(null);
    setTitle("");
    setDue("");
    setErrors({});
  }, [open]);

  const options = useMemo<Option[]>(() => {
    const list: Option[] = [];
    if (canWriteAll("adm")) list.push({ value: ADM, label: "Administrativo", description: "Tarefa interna, fora de projeto" });
    if (canWrite("tasks")) (projects.data ?? []).filter((p) => !p.pausedAt).forEach((p) => list.push({ value: p.id, label: `${p.code} · ${p.title}`, description: p.clientName }));
    return list;
  }, [projects.data, canWrite, canWriteAll]);

  const create = useApiMutation(
    () =>
      tasksApi.create({
        projectId: where === ADM ? null : where,
        module: where === ADM ? "adm" : "projeto",
        title,
        dueAt: due ? fromDateInput(due) : null,
        assigneeUserId: user.id,
      }),
    { success: "Tarefa criada", onSuccess: () => ok.flash(() => onOpenChange(false)), onError: (e) => e.fieldErrors && setErrors(e.fieldErrors) },
  );

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!where) errs.where = "Escolha o projeto ou o Administrativo";
    if (!title.trim()) errs.title = "Dê um título para a tarefa";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova tarefa"
      description="A tarefa é atribuída a você. Para delegar, abra a tarefa depois e troque o responsável."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon="add" loading={create.isPending} success={ok.success} successLabel="Criada" onClick={submit}>
            Criar tarefa
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField label="Onde" required options={options} value={where} onChange={setWhere} placeholder={projects.isLoading ? "Carregando projetos…" : "Escolha o projeto"} searchPlaceholder="Buscar projeto…" emptyText="Nenhum projeto ativo em que você possa criar tarefas" error={errors.where} />
        <TextField label="Título" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: revisar o roteiro do vídeo" error={errors.title} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <DateField label="Prazo" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
    </Dialog>
  );
}
