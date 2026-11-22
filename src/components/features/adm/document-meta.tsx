"use client";
import { Badge } from "@/components/ui";
import type { InstitutionalDocument } from "@/data/types";
import { daysUntil } from "@/lib/format";

export const DOCUMENT_CATEGORY_LABEL: Record<InstitutionalDocument["category"], string> = {
  contrato_social: "Contrato social",
  certidao: "Certidão",
  alvara: "Alvará",
  seguro: "Seguro",
  outro: "Outro",
};

export const documentCategoryOptions = (Object.keys(DOCUMENT_CATEGORY_LABEL) as InstitutionalDocument["category"][]).map((value) => ({ value, label: DOCUMENT_CATEGORY_LABEL[value] }));

export type ValidityState = "vencido" | "vencendo" | "valido" | "sem_validade";

/** Validade (RF-M6-02): vencido, ≤ 30 dias, válido ou sem validade. */
export function validityOf(validUntil: string | null): { state: ValidityState; days: number | null } {
  if (!validUntil) return { state: "sem_validade", days: null };
  const days = daysUntil(validUntil);
  if (days == null) return { state: "sem_validade", days: null };
  if (days < 0) return { state: "vencido", days };
  if (days <= 30) return { state: "vencendo", days };
  return { state: "valido", days };
}

export function ValidityBadge({ validUntil }: { validUntil: string | null }) {
  const { state, days } = validityOf(validUntil);
  if (state === "vencido") return <Badge tone="danger" dot>Vencido há {Math.abs(days!)} {Math.abs(days!) === 1 ? "dia" : "dias"}</Badge>;
  if (state === "vencendo") return <Badge tone="warning" dot>{days === 0 ? "Vence hoje" : `Vence em ${days} ${days === 1 ? "dia" : "dias"}`}</Badge>;
  if (state === "valido") return <Badge tone="success" dot>Válido</Badge>;
  return <Badge tone="neutral">Sem validade</Badge>;
}
