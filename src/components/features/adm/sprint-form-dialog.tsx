"use client";
import { useEffect, useState } from "react";
import { Button, DateField, Dialog, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { tasksApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";
import type { Sprint } from "@/data/types";
import { fromDateInput, toDateInput } from "@/lib/format";

/** Criação (e edição, RN-78) de sprint com validação (RF-M6-01). */
export function SprintFormDialog({ open, onOpenChange, onCreated, sprint }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void; sprint?: Sprint | null }) {
  const [name, setName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const start = new Date();
      const end = new Date(Date.now() + 13 * 86_400_000);
      setName(sprint?.name ?? "");
      setStartAt(toDateInput(sprint?.startAt ?? start.toISOString()));
      setEndAt(toDateInput(sprint?.endAt ?? end.toISOString()));
      setErrors({});
    }
  }, [open, sprint]);

  const create = useApiMutation((v: { name: string; startAt: string; endAt: string }) => (sprint ? tasksApi.updateSprint(sprint.id, v) : tasksApi.createSprint(v)), {
    success: sprint ? "Sprint atualizada" : "Sprint criada",
    onSuccess: (s) => {
      onOpenChange(false);
      onCreated?.(s.id);
    },
    onError: (e) => setErrors(e.fieldErrors ?? {}),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Dê um nome à sprint, ex.: Sprint 25";
    if (!startAt) errs.startAt = "Informe a data de início";
    if (!endAt) errs.endAt = "Informe a data final";
    else if (startAt && endAt < startAt) errs.endAt = "A data final deve ser depois da inicial";
    setErrors(errs);
    if (Object.keys(errs).length) {
      focusFirstInvalid();
      return;
    }
    create.mutate({ name, startAt: fromDateInput(startAt)!, endAt: fromDateInput(endAt)! });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={sprint ? "Editar sprint" : "Nova sprint"}
      description="Sprints organizam as tarefas internas do Administrativo em ciclos."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            {sprint ? "Salvar sprint" : "Criar sprint"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Nome" required autoFocus value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Sprint 25" />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="Início" required value={startAt} onChange={(e) => setStartAt(e.target.value)} error={errors.startAt} />
          <DateField label="Fim" required value={endAt} onChange={(e) => setEndAt(e.target.value)} error={errors.endAt} />
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
