"use client";
import { cn } from "@/lib/cn";

/** Linha de totais para o `footer` do DataTable: rótulo ocupa `span` colunas, depois uma célula por total. */
export function TotalsRow({ span, label, cells }: { span: number; label: React.ReactNode; cells: { value: React.ReactNode; align?: "right" | "left" }[] }) {
  return (
    <tr>
      <td colSpan={span} className="px-4 py-2.5 text-xs font-medium text-fg-subtle">
        {label}
      </td>
      {cells.map((c, i) => (
        <td key={i} className={cn("px-3 py-2.5 text-sm font-semibold tabular-nums text-fg last:pr-4", c.align === "left" ? "text-left" : "text-right")}>
          {c.value}
        </td>
      ))}
    </tr>
  );
}

/** Faixa de resumo para o celular (o rodapé da tabela só aparece no desktop). */
export function SummaryStrip({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line bg-surface-2 px-3 py-2 md:hidden">
      {items.map((i) => (
        <div key={i.label} className="flex items-baseline gap-1.5 text-xs">
          <dt className="text-fg-subtle">{i.label}</dt>
          <dd className="font-semibold tabular-nums text-fg">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
