"use client";
/** Cartão de projeto (RF-M4-03) e linha de projeto para a visão lista. */
import Link from "next/link";
import { AvatarStack, Badge, Icon, ProgressRing, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ProjectListItem } from "@/data/services";
import { BillingBadge, DueChip, Money, PriorityPill, ProjectCode, ProjectStageLabel, ProjectStatusBadge, ProjectTypeIcon, QuoteStageLabel } from "./badges";

export function ProjectCard({ project: p, dragging, href, compact }: { project: ProjectListItem; dragging?: boolean; href?: string; compact?: boolean }) {
  const done = p.status === "concluido" || p.status === "arquivado";
  const team = p.members.map((m) => ({ id: m.id, name: m.name, color: m.color }));
  return (
    <Link
      href={href ?? `/projetos/${p.code}`}
      draggable={false}
      onClick={(e) => dragging && e.preventDefault()}
      className={cn(
        "group block rounded-lg border border-line bg-layer-2 p-3 text-xs transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised-2 focus-visible:outline-2",
        dragging && "border-accent-line shadow-overlay",
        p.isOverdue && "border-l-2 border-l-danger",
      )}
    >
      <div className="flex items-center gap-2">
        <Tooltip content={p.typeName}>
          <span>
            <ProjectTypeIcon icon={p.typeIcon} size="xs" />
          </span>
        </Tooltip>
        <ProjectCode code={p.code} />
        <span className="flex-1" />
        {p.pendingApproval && (
          <Tooltip content="Aguardando aprovação">
            <span className="text-warning">
              <Icon name="approval" size="sm" />
            </span>
          </Tooltip>
        )}
        {p.origin === "direto" && <Badge size="xs" tone="neutral">Direto</Badge>}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-fg">{p.title}</p>
      <p className="mt-0.5 truncate text-xs text-fg-subtle">{p.clientName}</p>
      {!compact && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <PriorityPill value={p.priorityKey} size="sm" showLabel={false} />
          <DueChip date={p.dueAt} done={done} size="sm" />
          {p.subtasksTotal > 0 && (
            <span className="inline-flex h-5 items-center gap-1 rounded-md border border-line px-1 text-fg-subtle">
              <ProgressRing value={p.subtasksDone} max={p.subtasksTotal} size={12} />
              <span className="tabular-nums">
                {p.subtasksDone}/{p.subtasksTotal}
              </span>
            </span>
          )}
          <BillingBadge status={p.billingStatus} />
          <span className="flex-1" />
          <AvatarStack people={team} size="sm" max={3} />
        </div>
      )}
    </Link>
  );
}

/** Linha de projeto (visão lista / ficha do cliente / freelancer). */
export function ProjectRow({ project: p, showStage = true, showValue = false, href }: { project: ProjectListItem; showStage?: boolean; showValue?: boolean; href?: string }) {
  const done = p.status === "concluido" || p.status === "arquivado";
  return (
    <Link href={href ?? `/projetos/${p.code}`} className="group flex min-h-11 items-center gap-3 border-b border-line px-4 py-2 last:border-0 hover:bg-layer-hover/60 max-md:flex-wrap max-md:gap-y-1.5 max-md:py-3">
      <ProjectCode code={p.code} className="w-16" />
      <span className="min-w-0 flex-1 max-md:basis-[calc(100%-5rem)]">
        <span className="block truncate text-sm font-medium text-fg">{p.title}</span>
        <span className="block truncate text-xs text-fg-subtle md:hidden">{p.clientName}</span>
      </span>
      <span className="w-36 truncate text-xs text-fg-subtle max-md:hidden">{p.clientName}</span>
      <span className="flex items-center gap-1.5 max-md:pl-[4.75rem]">
        {showStage && (
          <span className="w-40 truncate text-xs text-fg-muted max-lg:hidden">
            {p.status === "cotacao" ? <QuoteStageLabel stageKey={p.quoteStageKey} /> : p.status === "ativo" ? <ProjectStageLabel stageKey={p.projectStageKey} /> : <ProjectStatusBadge status={p.status} />}
          </span>
        )}
        <PriorityPill value={p.priorityKey} size="sm" showLabel={false} />
        <span className="w-24">
          <DueChip date={done ? p.completedAt : p.dueAt} done={done} size="sm" />
        </span>
        {showValue && <Money cents={p.contractedAmountCents} className="w-24 text-right text-xs text-fg-muted max-sm:hidden" />}
        <span className="w-16 max-sm:hidden">
          <AvatarStack people={p.members.map((m) => ({ id: m.id, name: m.name, color: m.color }))} size="sm" max={3} />
        </span>
      </span>
    </Link>
  );
}

/** Grupo colapsável de linhas (lista agrupada por etapa, estilo Plane). */
export function ProjectGroup({ title, icon, count, children, defaultOpen = true }: { title: string; icon?: React.ReactNode; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group/grp border-b border-line">
      <summary className="sticky top-0 z-[5] flex h-9 cursor-pointer list-none items-center gap-2 border-b border-line bg-surface-2 px-4 text-sm hover:bg-layer-hover [&::-webkit-details-marker]:hidden">
        <Icon name="chevronRight" size="xs" className="text-fg-subtle transition-transform group-open/grp:rotate-90" />
        {icon}
        <span className="font-medium text-fg">{title}</span>
        <span className="text-xs tabular-nums text-fg-subtle">{count}</span>
      </summary>
      <div>{children}</div>
    </details>
  );
}
