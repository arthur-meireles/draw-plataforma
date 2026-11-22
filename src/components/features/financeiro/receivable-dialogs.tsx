"use client";
import { useState } from "react";
import { Button, Dialog, DateField, FileDropzone, MoneyField, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { financeApi, financeExtraApi, INVOICE_MAX_BYTES } from "@/data/services";
import { fileSize, fromDateInput, toDateInput } from "@/lib/format";
import type { ReceivableRow } from "./types";

const today = () => toDateInput(new Date().toISOString());

/** RF-M5-02 — emitir NF: número, data, impostos e PDF (categoria `nf`). */
export function IssueInvoiceDialog({ row, open, onOpenChange }: { row: ReceivableRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [number, setNumber] = useState(row.invoiceNumber ?? "");
  const [date, setDate] = useState(today());
  const [tax, setTax] = useState<number>(row.taxCents);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useApiMutation(
    () => financeExtraApi.issueInvoiceWithFile(row.id, row.projectId, { invoiceNumber: number, issuedAt: fromDateInput(date)!, taxCents: tax, file }),
    { success: "NF emitida. O lançamento agora está faturado.", onSuccess: () => onOpenChange(false), onError: (e) => e.fieldErrors && setErrors(e.fieldErrors) },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!number.trim()) errs.invoiceNumber = "Informe o número da NF";
    if (!date) errs.date = "Informe a data de emissão";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(undefined);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Emitir NF"
      description={`${row.projectCode} · ${row.description}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>
            Emitir NF
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
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Número da NF" required autoFocus value={number} onChange={(e) => setNumber(e.target.value)} error={errors.invoiceNumber} />
          <DateField label="Data de emissão" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        </div>
        <MoneyField label="Impostos retidos" value={tax} onChange={setTax} hint="Opcional. Aparece na coluna Impostos." />
        <FileDropzone
          label="PDF da nota fiscal"
          accept="application/pdf,.pdf"
          file={file}
          onFile={setFile}
          validate={(f) => (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf" ? "Envie o arquivo em PDF" : f.size > INVOICE_MAX_BYTES ? `O PDF tem ${fileSize(f.size)}; o limite é 10 MB` : null)}
          hint="PDF, até 10 MB. Fica guardado em Arquivos do projeto."
        />
      </form>
    </Dialog>
  );
}

/** Dar baixa: data do recebimento. */
export function ReceiveDialog({ row, open, onOpenChange }: { row: ReceivableRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string>();
  const m = useApiMutation(() => financeApi.receive(row.id, fromDateInput(date)!), { success: "Baixa registrada.", onSuccess: () => onOpenChange(false) });
  const submit = () => {
    if (!date) return setError("Informe a data do recebimento");
    setError(undefined);
    m.mutate(undefined);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Dar baixa"
      description={`${row.projectCode} · NF ${row.invoiceNumber ?? "—"}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={submit}>
            Confirmar recebimento
          </Button>
        </>
      }
    >
      <DateField label="Data do recebimento" required autoFocus value={date} onChange={(e) => setDate(e.target.value)} error={error} />
    </Dialog>
  );
}

/** Editar valor, vencimento e descrição (RN-09: alteração de valor gera evento com antes/depois). */
export function EditReceivableDialog({ row, open, onOpenChange }: { row: ReceivableRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [amount, setAmount] = useState(row.amountCents);
  const [due, setDue] = useState(toDateInput(row.expectedAt));
  const [description, setDescription] = useState(row.description);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useApiMutation(
    () => financeApi.updateReceivable(row.id, { amountCents: amount, expectedAt: fromDateInput(due)!, description: description.trim() }),
    { success: "Lançamento atualizado.", onSuccess: () => onOpenChange(false) },
  );
  const submit = () => {
    const errs: Record<string, string> = {};
    if (amount <= 0) errs.amount = "Informe um valor maior que zero";
    if (!due) errs.due = "Informe o vencimento";
    if (!description.trim()) errs.description = "Descreva o lançamento";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(undefined);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar lançamento"
      description={`${row.projectCode} · ${row.clientName}`}
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
          <MoneyField label="Valor" required value={amount} onChange={setAmount} error={errors.amount} hint="Mudanças de valor ficam registradas no histórico, com antes e depois (RN-09)." />
          <DateField label="Vencimento" required value={due} onChange={(e) => setDue(e.target.value)} error={errors.due} />
        </div>
      </form>
    </Dialog>
  );
}
