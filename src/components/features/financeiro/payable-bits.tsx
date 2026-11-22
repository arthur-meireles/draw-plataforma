"use client";
import { Money } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import type { PayableKind } from "@/data/types";
import type { PayableRow } from "./types";

export const PAYABLE_KIND_LABEL: Record<PayableKind, string> = {
  freelancer: "Freelancer",
  despesa_projeto: "Despesa de projeto",
  despesa_adm: "Despesa administrativa",
};

/** Valor de conta a pagar: quem tem acesso a pagáveis (inclusive o freelancer, nos próprios) enxerga o valor. */
export function PayableAmount({ cents, className }: { cents: number | null | undefined; className?: string }) {
  const { access } = usePermissions();
  if (access("payables") === "P") return <span className={cn("tabular-nums", className)}>{money(cents)}</span>;
  return <Money cents={cents} className={className} />;
}

/** Diferença entre NF e acordado (RN-04). `null` quando não há NF ou não diverge. */
export const payableDiff = (p: Pick<PayableRow, "invoicedAmountCents" | "agreedAmountCents">) => (p.invoicedAmountCents != null && p.invoicedAmountCents !== p.agreedAmountCents ? p.invoicedAmountCents - p.agreedAmountCents : null);

export function InvoicedAmount({ row }: { row: Pick<PayableRow, "invoicedAmountCents" | "agreedAmountCents"> }) {
  if (row.invoicedAmountCents == null) return <span className="text-fg-subtle">—</span>;
  const diff = payableDiff(row);
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <PayableAmount cents={row.invoicedAmountCents} className={diff != null ? "font-medium text-danger" : undefined} />
      {diff != null && (
        <span className="text-2xs text-danger">
          {diff > 0 ? "+" : "−"}
          {money(Math.abs(diff))}
        </span>
      )}
    </span>
  );
}
