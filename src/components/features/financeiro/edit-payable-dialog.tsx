"use client";
/** RN-86 — editar vencimento e descrição de uma conta a pagar; valor, favorecido e categoria só de despesas. */
import { useState } from "react";
import { Button, DateField, Dialog, MoneyField, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { financeMedioApi } from "@/data/services";
import { fromDateInput, toDateInput } from "@/lib/format";
import type { PayableRow } from "./types";

export function EditPayableDialog({ row, open, onOpenChange }: { row: PayableRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const isExpense = row.kind !== "freelancer";
  const [description, setDescription] = useState(row.description);
  const [due, setDue] = useState(toDateInput(row.dueAt));
  const [amount, setAmount] = useState(row.agreedAmountCents);
  const [payee, setPayee] = useState(row.payeeName ?? "");
  const [category, setCategory] = useState(row.category ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useApiMutation(
    () =>
      financeMedioApi.updatePayable(row.id, {
        description,
        dueAt: fromDateInput(due)!,
        ...(isExpense ? { agreedAmountCents: amount, payeeName: payee, category } : {}),
      }),
    { success: "Conta atualizada.", onSuccess: () => onOpenChange(false), onError: (e) => e.fieldErrors && setErrors({ ...e.fieldErrors, amount: e.fieldErrors.agreedAmountCents ?? "", due: e.fieldErrors.dueAt ?? "" }) },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = "Descreva o lançamento";
    if (!due) errs.due = "Informe o vencimento";
    if (isExpense && amount <= 0) errs.amount = "Informe o valor";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(undefined);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar conta a pagar"
      description={row.freelancerName ?? row.description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>
            Salvar alterações
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
        <TextField label="Descrição" required value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="Vencimento" required value={due} onChange={(e) => setDue(e.target.value)} error={errors.due} hint={!isExpense ? "Exceção de pagamento combinada com o freelancer (RN-06). A mudança fica no histórico." : undefined} />
          {isExpense && <MoneyField label="Valor" required value={amount} onChange={setAmount} error={errors.amount} hint="Mudanças de valor ficam no histórico (RN-09)." />}
        </div>
        {isExpense && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Favorecido" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Ex.: Gráfica Alfa" />
            <TextField label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: Impressão" />
          </div>
        )}
      </form>
    </Dialog>
  );
}
