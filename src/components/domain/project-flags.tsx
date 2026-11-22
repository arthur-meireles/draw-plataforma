"use client";
/** Marcadores compartilhados vindos da planilha master: projeto parado, porte do projeto e cobrança adicional. */
import { Badge, Tooltip } from "@/components/ui";
import { PROJECT_SIZE_LABEL } from "@/data/reference";
import type { ProjectSize, Receivable } from "@/data/types";
import { cn } from "@/lib/cn";

/** Selo "Parado" (caso parado): projeto pausado não entra nos alertas de prazo. */
export function PausedBadge({ reason, size = "xs", className }: { reason?: string | null; size?: "xs" | "sm"; className?: string }) {
  const badge = (
    <Badge tone="warning" icon="pause" size={size} className={className}>
      Parado
    </Badge>
  );
  return reason ? (
    <Tooltip content={`Parado: ${reason}`}>
      <span className="inline-flex">{badge}</span>
    </Tooltip>
  ) : (
    badge
  );
}

const SIZE_LETTER: Record<ProjectSize, string> = { pequeno: "P", medio: "M", grande: "G" };

/** Porte do projeto como chip discreto (P / M / G), com o nome completo no tooltip. */
export function ProjectSizeChip({ size, className }: { size: ProjectSize | null | undefined; className?: string }) {
  if (!size) return null;
  return (
    <Tooltip content={`Porte ${PROJECT_SIZE_LABEL[size].toLowerCase()}`}>
      <span aria-label={`Porte ${PROJECT_SIZE_LABEL[size].toLowerCase()}`} className={cn("inline-flex size-5 items-center justify-center rounded-md border border-line font-display text-2xs font-semibold text-fg-subtle", className)}>
        {SIZE_LETTER[size]}
      </span>
    </Tooltip>
  );
}

/** Selo "Adicional" para recebíveis de cobrança adicional; parcelas normais não mostram nada. */
export function ReceivableKindBadge({ kind, className }: { kind: Receivable["kind"] | undefined; className?: string }) {
  if (kind !== "adicional") return null;
  return (
    <Badge tone="violet" size="xs" className={className}>
      Adicional
    </Badge>
  );
}
