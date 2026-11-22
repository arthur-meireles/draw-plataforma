"use client";
/** Cobrança adicional (planilha: Valor/Status/Data Cobrança Adicional): lança um recebível extra no projeto. */
import { useEffect, useState } from "react";
import { Button, DateField, Dialog, MoneyField, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { financeApi } from "@/data/services";
import type { ID } from "@/data/types";
import { fromDateInput } from "@/lib/format";

export function AdditionalChargeDialog({ projectId, projectCode, open, onOpenChange }: { projectId: ID; projectCode: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDescription("");
      setAmount(0);
      setDate("");
      setErrors({});
    }
  }, [open]);

  const m = useApiMutation(() => financeApi.addAdditionalCharge(projectId, { description, amountCents: amount, expectedAt: fromDateInput(date)! }), {
    success: "Cobrança adicional lançada em contas a receber",
    onSuccess: () => onOpenChange(false),
    onError: (e) => e.fieldErrors && setErrors({ description: e.fieldErrors.description ?? "", amount: e.fieldErrors.amountCents ?? "", date: e.fieldErrors.expectedAt ?? "" }),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = "Descreva o que está sendo cobrado";
    if (amount <= 0) errs.amount = "Informe um valor maior que zero";
    if (!date) errs.date = "Informe a data prevista";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Cobrança adicional"
      description={`Lança um valor extra em ${projectCode}, além das parcelas da proposta. O imposto é calculado pela alíquota da organização.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>
            Lançar cobrança
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
        <TextField label="Descrição" required autoFocus placeholder="Ex.: Ajuste extra de layout" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description || undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField label="Valor" required value={amount} onChange={setAmount} error={errors.amount || undefined} />
          <DateField label="Data prevista" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date || undefined} />
        </div>
      </form>
    </Dialog>
  );
}
