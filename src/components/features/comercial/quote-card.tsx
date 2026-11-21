"use client";
/** Cartão comercial do funil (RF-M3-01): valor e versão da última proposta, dias desde o envio, responsável. */
import Link from "next/link";
import { Avatar, Badge, Icon, Tooltip } from "@/components/ui";
import { Money, PriorityPill, ProjectCode, ProjectTypeIcon } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { cn } from "@/lib/cn";
import type { QuoteItem } from "@/data/services";
import { StalledChip } from "./stalled-chip";

export function QuoteCard({ quote: q, dragging }: { quote: QuoteItem; dragging?: boolean }) {
  const { money: canSeeMoney } = usePermissions();
  const closed =q.column === "aprovada" || q.column === "perdida";
  return (
    <Link
      href={`/projetos/${q.code}`}
      draggable={false}
      onClick={(e) => dragging && e.preventDefault()}
      className={cn(
        "block rounded-lg border border-line bg-layer-2 p-3 text-xs transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised-2",
        dragging && "border-accent-line shadow-overlay",
        q.column === "perdida" && "opacity-80",
      )}
    >
      <div className="flex items-center gap-2">
        <Tooltip content={q.typeName}>
          <span>
            <ProjectTypeIcon icon={q.typeIcon} size="xs" />
          </span>
        </Tooltip>
        <ProjectCode code={q.code} />
        <span className="flex-1" />
        {q.column === "aprovada" && <Badge tone="success" size="xs" icon="approval">Aprovada</Badge>}
        {q.column === "perdida" && <Badge tone="danger" size="xs">Perdida</Badge>}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-fg">{q.title}</p>
      <p className="mt-0.5 truncate text-xs text-fg-subtle">{q.clientName}</p>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {q.proposalAmountCents != null || !canSeeMoney ? (
            <>
              <Money cents={q.proposalAmountCents} className="block text-sm font-semibold text-fg" />
              {q.proposalVersion != null && (
                <span className="text-2xs text-fg-subtle">
                  Proposta v{q.proposalVersion}
                  {q.proposalStatus === "rascunho" ? " · rascunho" : ""}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-fg-placeholder">Sem proposta</span>
          )}
        </div>
        <Tooltip content={q.ownerName}>
          <span>
            <Avatar name={q.ownerName} color={q.ownerColor} size="sm" />
          </span>
        </Tooltip>
      </div>

      {!closed && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2">
          <PriorityPill value={q.priorityKey} size="sm" showLabel={false} />
          {q.daysSinceSent != null && (
            <span className="inline-flex items-center gap-1 text-fg-subtle">
              <Icon name="send" size="xs" />
              {q.daysSinceSent === 0 ? "Enviada hoje" : `Enviada há ${q.daysSinceSent} d`}
            </span>
          )}
          <span className="flex-1" />
          <StalledChip days={q.stalledDays} />
        </div>
      )}
      {q.column === "perdida" && q.lostReason && <p className="mt-2 line-clamp-2 border-t border-line pt-2 text-fg-subtle">{q.lostReason}</p>}
    </Link>
  );
}
