"use client";
import { Money } from "@/components/domain";
import { money } from "@/lib/format";

/** Valor monetário que também aparece para o próprio freelancer (`visible`); senão segue a regra de `<Money>`. */
export function FreelancerMoney({ cents, visible, className }: { cents: number | null | undefined; visible: boolean; className?: string }) {
  if (visible) return <span className={className ? `tabular-nums ${className}` : "tabular-nums"}>{money(cents)}</span>;
  return <Money cents={cents} className={className} />;
}
