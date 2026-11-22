"use client";
import { useEffect, useState } from "react";
import { PersonField, priorityOptions, taskStatusOptions, type PersonRef } from "@/components/domain";
import { Button, DateField, Dialog, SelectField, TextareaField, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { tasksApi } from "@/data/services";
import type { PriorityKey, TaskStatusKey } from "@/data/types";
import { focusFirstInvalid } from "@/lib/focus";
import { fromDateInput } from "@/lib/format";

export interface AdmTaskDefaults {
  statusKey?: TaskStatusKey;
  sprintId?: string | null;
}

/** Nova tarefa interna (module = adm). */
export function AdmTaskDialog({ open, onOpenChange, defaults, sprintOptions }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: AdmTaskDefaults; sprintOptions: { value: string; label: string }[] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<PersonRef | null>(null);
  const [priority, setPriority] = useState<PriorityKey>("media");
  const [status, setStatus] = useState<TaskStatusKey>("a_fazer");
  const [sprintId, setSprintId] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setAssignee(null);
    setPriority("media");
    setStatus(defaults?.statusKey ?? "a_fazer");
    setSprintId(defaults?.sprintId ?? null);
    setDue("");
    setErrors({});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useApiMutation(tasksApi.create, {
    success: "Tarefa criada",
    onSuccess: () => onOpenChange(false),
    onError: (e) => setErrors(e.fieldErrors ?? {}),
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) {
      setErrors({ title: "Dê um título para a tarefa" });
      focusFirstInvalid();
      return;
    }
    create.mutate({
      module: "adm",
      projectId: null,
      title,
      description: description.trim() || null,
      assigneeUserId: assignee?.kind === "user" ? assignee.id : null,
      priorityKey: priority,
      statusKey: status,
      sprintId,
      dueAt: due ? fromDateInput(due) : null,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova tarefa interna"
      description="Tarefas do Administrativo ficam no backlog ou em uma sprint."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={() => submit()}>
            Criar tarefa
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Título" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="O que precisa ser feito?" />
        <TextareaField label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Contexto, links e critérios de pronto (opcional)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <PersonField label="Responsável" internalOnly clearable value={assignee} onChange={setAssignee} placeholder="Sem responsável" />
          <DateField label="Prazo" value={due} onChange={(e) => setDue(e.target.value)} />
          <SelectField label="Prioridade" options={priorityOptions} value={priority} onChange={(v) => v && setPriority(v)} />
          <SelectField label="Status" options={taskStatusOptions} value={status} onChange={(v) => v && setStatus(v)} />
          <SelectField label="Sprint" options={sprintOptions} value={sprintId} onChange={setSprintId} clearable placeholder="Backlog (sem sprint)" containerClassName="sm:col-span-2" />
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
