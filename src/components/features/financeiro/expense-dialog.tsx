"use client";
import { useState } from "react";
import { Button, DateField, Dialog, MoneyField, SegmentedControl, SelectField, TextField } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { financeApi, projectsApi } from "@/data/services";
import { fromDateInput } from "@/lib/format";

type Kind = "despesa_projeto" | "despesa_adm";

/** RF-M5-03 — despesa de projeto ou administrativa lançada manualmente. */
export function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [kind, setKind] = useState<Kind>("despesa_projeto");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState("");
  const [payee, setPayee] = useState("");
  const [category, setCategory] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const projects = useApiQuery(["projects", "options"], () => projectsApi.list(), { enabled: open });
  const m = useApiMutation(() => financeApi.createExpense({ kind, projectId, description, agreedAmountCents: amount, dueAt: fromDateInput(due)!, payeeName: payee, category }), {
    success: "Despesa lançada como aprovada, pronta para pagamento.",
    onSuccess: () => onOpenChange(false),
    onError: (e) => e.fieldErrors && setErrors({ ...e.fieldErrors, amount: e.fieldErrors.agreedAmountCents ?? "" }),
  });
  const submit = () => {
    const errs: Record<string, string> = {};
    if (kind === "despesa_projeto" && !projectId) errs.projectId = "Escolha o projeto";
    if (!description.trim()) errs.description = "Descreva a despesa";
    if (amount <= 0) errs.amount = "Informe o valor";
    if (!due) errs.due = "Informe o vencimento";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(undefined);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova despesa"
      description="Despesas entram como aprovadas; registre o pagamento quando sair o dinheiro."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>
            Lançar despesa
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
        <SegmentedControl
          aria-label="Tipo de despesa"
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (k === "despesa_adm") setProjectId(null);
          }}
          options={[
            { value: "despesa_projeto", label: "Despesa de projeto" },
            { value: "despesa_adm", label: "Administrativa" },
          ]}
        />
        {kind === "despesa_projeto" && (
          <SelectField
            label="Projeto"
            required
            value={projectId}
            onChange={setProjectId}
            error={errors.projectId}
            placeholder="Escolha o projeto"
            searchPlaceholder="Buscar projeto…"
            options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.title}`, keywords: [p.code] }))}
          />
        )}
        <TextField label="Descrição" required value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} placeholder="Ex.: impressão de encadernação" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Favorecido" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Ex.: Gráfica Alfa" hint="Fornecedor que recebe o pagamento." />
          <TextField label="Categoria" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex.: Impressão" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField label="Valor" required value={amount} onChange={setAmount} error={errors.amount} />
          <DateField label="Vencimento" required value={due} onChange={(e) => setDue(e.target.value)} error={errors.due} />
        </div>
      </form>
    </Dialog>
  );
}
