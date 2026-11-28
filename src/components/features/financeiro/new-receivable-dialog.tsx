"use client";
/** RN-85 — "Novo recebível": parcela avulsa em contas a receber (projeto obrigatório). */
import { useEffect, useState } from "react";
import { Button, DateField, Dialog, MoneyField, SelectField, TextField } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { financeMedioApi, projectsApi } from "@/data/services";
import { fromDateInput } from "@/lib/format";

export function NewReceivableDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (id: string) => void }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const projects = useApiQuery(["projects", "options"], () => projectsApi.list(), { enabled: open });
  useEffect(() => {
    if (open) {
      setProjectId(null);
      setDescription("");
      setAmount(0);
      setDue("");
      setErrors({});
    }
  }, [open]);
  const m = useApiMutation(() => financeMedioApi.createReceivable({ projectId: projectId!, description, amountCents: amount, expectedAt: fromDateInput(due)! }), {
    success: "Recebível lançado como previsto.",
    onSuccess: (r) => {
      onOpenChange(false);
      onCreated?.(r.id);
    },
    onError: (e) => e.fieldErrors && setErrors({ ...e.fieldErrors, amount: e.fieldErrors.amountCents ?? "", due: e.fieldErrors.expectedAt ?? "" }),
  });
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!projectId) errs.projectId = "Escolha o projeto";
    if (!description.trim()) errs.description = "Descreva o lançamento";
    if (amount <= 0) errs.amount = "Informe o valor";
    if (!due) errs.due = "Informe o vencimento";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(undefined);
  };
  const options = (projects.data ?? []).filter((p) => p.status === "ativo" || p.status === "concluido").map((p) => ({ value: p.id, label: `${p.code} · ${p.title}`, keywords: [p.code] }));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Novo recebível"
      description="Lança uma parcela avulsa em um projeto ativo ou concluído. O imposto é calculado pela alíquota da organização; o valor contratado não muda."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>
            Lançar recebível
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <SelectField label="Projeto" required value={projectId} onChange={setProjectId} error={errors.projectId} placeholder="Escolha o projeto" searchPlaceholder="Buscar projeto…" options={options} />
        <TextField label="Descrição" required value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} placeholder="Ex.: Parcela extra combinada por e-mail" />
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField label="Valor" required value={amount} onChange={setAmount} error={errors.amount} />
          <DateField label="Vencimento" required value={due} onChange={(e) => setDue(e.target.value)} error={errors.due} />
        </div>
      </form>
    </Dialog>
  );
}
