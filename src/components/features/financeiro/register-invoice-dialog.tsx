"use client";
import { useState } from "react";
import { Button, Callout, DateField, Dialog, FileDropzone, MoneyField, TextField, TextareaField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { financeExtraApi, INVOICE_MAX_BYTES } from "@/data/services";
import { fileSize, fromDateInput, money, toDateInput } from "@/lib/format";
import type { PayableRow } from "./types";

/** RN-41 — NF do freelancer recebida por outro canal: o Financeiro registra nº, valor, data e (de preferência) o PDF. */
export function RegisterInvoiceDialog({ row, open, onOpenChange }: { row: PayableRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [number, setNumber] = useState("");
  const [amount, setAmount] = useState(row.agreedAmountCents);
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const m = useApiMutation(() => financeExtraApi.registerFreelancerInvoiceWithFile(row.id, row.projectId, { invoiceNumber: number, amountCents: amount, issuedAt: fromDateInput(date)!, note, file }), {
    success: (p) => (p.status === "divergente" ? "NF registrada como divergente: o valor difere do acordado." : "NF registrada. Confira e aprove para liberar o pagamento."),
    onSuccess: () => onOpenChange(false),
    onError: (e) => e.fieldErrors && setErrors({ number: e.fieldErrors.invoiceNumber ?? "", amount: e.fieldErrors.amountCents ?? "", date: e.fieldErrors.issuedAt ?? "", file: e.fieldErrors.file ?? "" }),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!number.trim()) errs.number = "Informe o número da NF";
    if (amount <= 0) errs.amount = "Informe o valor da NF";
    if (!date) errs.date = "Informe a data de emissão";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(undefined);
  };

  const differs = amount > 0 && amount !== row.agreedAmountCents;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar NF manualmente"
      description={`Use quando ${row.freelancerName ?? "o freelancer"} mandar a nota por e-mail, WhatsApp ou outro canal. A conta segue para conferência, como se tivesse vindo pelo formulário.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon="invoice" loading={m.isPending} onClick={submit}>
            Registrar NF
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
          <TextField label="Número da NF" required autoFocus inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} error={errors.number || undefined} />
          <DateField label="Data de emissão" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date || undefined} />
        </div>
        <MoneyField label="Valor da NF" required value={amount} onChange={setAmount} error={errors.amount || undefined} hint={`Valor acordado: ${money(row.agreedAmountCents)}`} />
        {differs && (
          <Callout tone="warning" title="Valor diferente do acordado">
            A conta fica como divergente (RN-04) até alguém aprovar a NF ou pedir uma nova.
          </Callout>
        )}
        <FileDropzone
          label="PDF da nota fiscal"
          accept="application/pdf,.pdf"
          file={file}
          onFile={setFile}
          error={errors.file || undefined}
          hint="Opcional, mas recomendado para auditoria. Somente PDF, até 10 MB."
          validate={(f) => (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf" ? "Envie a nota fiscal em PDF" : f.size > INVOICE_MAX_BYTES ? `O arquivo tem ${fileSize(f.size)}; o limite é 10 MB` : null)}
        />
        <TextareaField label="Observação" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: recebida por e-mail em 12/11" rows={2} />
      </form>
    </Dialog>
  );
}
