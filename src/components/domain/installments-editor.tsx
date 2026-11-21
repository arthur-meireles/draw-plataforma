"use client";
/** Editor de parcelas a receber (RN-02): descrição, valor e data prevista, com soma ao vivo contra o valor contratado. */
import { Button, DateField, IconButton, MoneyField, TextField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

export interface InstallmentRow {
  key: string;
  description: string;
  amountCents: number;
  /** yyyy-mm-dd */
  expectedAt: string;
}

const newKey = () => `i-${Math.random().toString(36).slice(2, 9)}`;
export const emptyInstallment = (n = 1): InstallmentRow => ({ key: newKey(), description: `Parcela ${n}`, amountCents: 0, expectedAt: "" });

/** Divide o total em N parcelas iguais (resto na última), a cada 30 dias a partir de hoje. */
export function splitInstallments(totalCents: number, count: number): InstallmentRow[] {
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + 30 * (i + 1));
    return { key: newKey(), description: count === 1 ? "Parcela única" : `Parcela ${i + 1} de ${count}`, amountCents: i === count - 1 ? totalCents - base * (count - 1) : base, expectedAt: d.toISOString().slice(0, 10) };
  });
}

export function InstallmentsEditor({ value, onChange, contractedCents, error, errors = {}, className }: { value: InstallmentRow[]; onChange: (rows: InstallmentRow[]) => void; contractedCents: number; error?: string; errors?: Record<string, string>; className?: string }) {
  const sum = value.reduce((a, r) => a + r.amountCents, 0);
  const diff = contractedCents - sum;
  const balanced = value.length > 0 && diff === 0;
  const patch = (key: string, p: Partial<InstallmentRow>) => onChange(value.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const hide = (i: number) => (i > 0 ? "md:sr-only" : "");

  return (
    <div data-field="installments" className={cn("space-y-3", className)}>
      <ul className="space-y-3">
        {value.map((r, i) => (
          <li key={r.key} className="grid gap-3 rounded-lg border border-line bg-layer/50 p-3 md:grid-cols-[1fr_10rem_10rem_auto] md:items-start md:border-0 md:bg-transparent md:p-0">
            <div data-field={`installments.${i}.description`}><TextField label={<span className={hide(i)}>Descrição</span>} value={r.description} onChange={(e) => patch(r.key, { description: e.target.value })} error={errors[`installments.${i}.description`]} placeholder="Ex.: Entrada" /></div>
            <div data-field={`installments.${i}.amountCents`}><MoneyField label={<span className={hide(i)}>Valor</span>} value={r.amountCents} onChange={(c) => patch(r.key, { amountCents: c })} error={errors[`installments.${i}.amountCents`]} /></div>
            <div data-field={`installments.${i}.expectedAt`}><DateField label={<span className={hide(i)}>Data prevista</span>} value={r.expectedAt} onChange={(e) => patch(r.key, { expectedAt: e.target.value })} error={errors[`installments.${i}.expectedAt`]} /></div>
            <div className={cn("flex justify-end", i === 0 ? "md:pt-[1.625rem]" : "")}>
              <IconButton icon="delete" label={`Remover parcela ${i + 1}`} variant="ghost" onClick={() => onChange(value.filter((x) => x.key !== r.key))} disabled={value.length === 1} />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon="add" onClick={() => onChange([...value, { ...emptyInstallment(value.length + 1), amountCents: Math.max(0, diff) }])}>
          Adicionar parcela
        </Button>
        {contractedCents > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange(splitInstallments(contractedCents, Math.max(1, value.length)))}>
            Dividir igualmente
          </Button>
        )}
      </div>

      <div role="status" aria-live="polite" className={cn("flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm", balanced ? "border-transparent bg-success-subtle text-success" : "border-transparent bg-danger-subtle text-danger")}>
        <span className="tabular-nums">
          Soma das parcelas: <strong>{money(sum)}</strong> de {money(contractedCents)}
        </span>
        <span className="text-xs font-medium">{balanced ? "Valores conferem" : diff > 0 ? `Faltam ${money(diff)} para fechar o valor contratado` : diff < 0 ? `Excede em ${money(-diff)} o valor contratado` : "Adicione ao menos uma parcela"}</span>
      </div>
      {error && !balanced && (
        <p aria-live="polite" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
