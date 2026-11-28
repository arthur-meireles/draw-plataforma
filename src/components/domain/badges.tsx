"use client";
/** Indicadores visuais de domínio: etapa, prioridade, status, prazo, tipo de projeto, dinheiro. */
import { useEffect, useRef, useState } from "react";
import { Badge, Combobox, Icon, Pill, Tooltip, type Option, type Tone } from "@/components/ui";
import { cn } from "@/lib/cn";
import { stageCategoryColor, priorityColor } from "@/design/tokens";
import {
  APPROVAL_DECISION_LABEL,
  PAYABLE_STATUS_LABEL,
  PRIORITIES,
  PROJECT_STAGES,
  PROJECT_STATUS_LABEL,
  PROPOSAL_STATUS_LABEL,
  QUOTE_STAGES,
  RECEIVABLE_STATUS_LABEL,
  TASK_STATUSES,
  priority as priorityRef,
  projectStage,
  quoteStage,
  taskStatus,
} from "@/data/reference";
import type { ApprovalDecision, PayableStatus, PriorityKey, ProjectStageKey, ProjectStatus, ProposalStatus, QuoteStageKey, ReceivableStatus, StageCategory, TaskStatusKey } from "@/data/types";
import { dueLabel, dueTone, money } from "@/lib/format";
import { usePermissions } from "@/components/layout/session";

/* ───────── Etapa (ícone de estado estilo Plane) ───────── */
export function StageIcon({ category, progress, size = 14 }: { category: StageCategory; progress?: number; size?: number }) {
  const color = stageCategoryColor[category];
  const r = size / 2 - 1.25;
  const c = 2 * Math.PI * r;
  if (category === "done")
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} fill={color} />
        <path d={`M${size * 0.3} ${size * 0.52} L${size * 0.44} ${size * 0.66} L${size * 0.7} ${size * 0.38}`} stroke="white" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (category === "lost")
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} fill={color} />
        <path d={`M${size * 0.35} ${size * 0.35} L${size * 0.65} ${size * 0.65} M${size * 0.65} ${size * 0.35} L${size * 0.35} ${size * 0.65}`} stroke="white" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  const pct = progress ?? (category === "waiting" ? 0.5 : 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={category === "open" && pct === 0 ? "2 1.6" : undefined} />
      {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r / 2} fill="none" stroke={color} strokeWidth={r} strokeDasharray={`${(c / 2) * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
  );
}

/** Progresso visual por ordem da etapa (para dar sensação de avanço no kanban). */
export function stageProgress(key: ProjectStageKey | null | undefined) {
  const s = projectStage(key);
  if (!s) return 0;
  return Math.min(1, (s.order - 1) / (PROJECT_STAGES.length - 1));
}

export function ProjectStageLabel({ stageKey, showIcon = true }: { stageKey: ProjectStageKey | null; showIcon?: boolean }) {
  const s = projectStage(stageKey);
  if (!s) return <span className="text-fg-subtle">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {showIcon && <StageIcon category={s.category} progress={s.category === "open" ? stageProgress(stageKey) : undefined} />}
      <span className="truncate">{s.label}</span>
    </span>
  );
}

export function QuoteStageLabel({ stageKey }: { stageKey: QuoteStageKey | null }) {
  const s = quoteStage(stageKey);
  if (!s) return <span className="text-fg-subtle">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <StageIcon category={s.category} progress={s.category === "open" ? (s.order - 1) / 5 : undefined} />
      <span className="truncate">{s.label}</span>
    </span>
  );
}

export const projectStageOptions = (exclude: ProjectStageKey[] = []): Option<ProjectStageKey>[] =>
  PROJECT_STAGES.filter((s) => !exclude.includes(s.key)).map((s) => ({ value: s.key, label: s.label, leading: <StageIcon category={s.category} progress={s.category === "open" ? stageProgress(s.key) : undefined} /> }));

export const quoteStageOptions = (exclude: QuoteStageKey[] = []): Option<QuoteStageKey>[] =>
  QUOTE_STAGES.filter((s) => !exclude.includes(s.key)).map((s) => ({ value: s.key, label: s.label, leading: <StageIcon category={s.category} progress={s.category === "open" ? (s.order - 1) / 5 : undefined} /> }));

/* ───────── Prioridade ───────── */
export function PriorityIcon({ priority, size = 14 }: { priority: PriorityKey; size?: number }) {
  const color = priorityColor[priority];
  if (priority === "urgente")
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-xs text-white" style={{ background: color, width: size, height: size }} aria-hidden>
        <svg width={size - 4} height={size - 4} viewBox="0 0 10 10">
          <path d="M5 1.5v4.2M5 7.8v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    );
  const bars = priority === "alta" ? 3 : priority === "media" ? 2 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className="shrink-0">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1.5 + i * 4} y={9 - i * 3} width={3} height={4 + i * 3} rx={0.8} fill={i < bars ? color : "var(--line-strong)"} />
      ))}
    </svg>
  );
}

export const priorityOptions: Option<PriorityKey>[] = PRIORITIES.map((p) => ({ value: p.key, label: p.label, leading: <PriorityIcon priority={p.key} /> }));

/** Pill editável de prioridade (abre dropdown). Sem onChange, vira só leitura. */
export function PriorityPill({ value, onChange, showLabel = true, size = "md" }: { value: PriorityKey; onChange?: (v: PriorityKey) => void; showLabel?: boolean; size?: "sm" | "md" }) {
  const label = priorityRef(value).label;
  const pill = (
    <Pill size={size} static={!onChange} pulseKey={value} leading={<PriorityIcon priority={value} size={12} />} aria-label={`Prioridade: ${label}`}>
      {showLabel ? label : undefined}
    </Pill>
  );
  if (!onChange) return showLabel ? pill : <Tooltip content={`Prioridade ${label}`}>{pill}</Tooltip>;
  return <Combobox options={priorityOptions} value={value} onChange={(v) => v && onChange(v)} trigger={pill} contentClassName="w-48" />;
}

/* ───────── Status de tarefa ───────── */
const taskCategory: Record<TaskStatusKey, StageCategory> = { a_fazer: "open", em_andamento: "open", em_revisao: "waiting", concluida: "done" };
export function TaskStatusIcon({ status, size = 14 }: { status: TaskStatusKey; size?: number }) {
  return <StageIcon category={taskCategory[status]} progress={status === "em_andamento" ? 0.5 : status === "a_fazer" ? 0 : undefined} size={size} />;
}
export const taskStatusOptions: Option<TaskStatusKey>[] = TASK_STATUSES.map((s) => ({ value: s.key, label: s.label, leading: <TaskStatusIcon status={s.key} /> }));

/**
 * Círculo clicável que conclui/reabre a tarefa. Ao concluir: o círculo se preenche, o ✓ se desenha e um anel fino
 * com o gradiente da marca se expande e some. Reabrir reverte rápido. `done` deve vir já otimista do pai.
 */
export function TaskCheck({ status, done, onToggle, disabled, size = 15, className }: { status: TaskStatusKey; done: boolean; onToggle: () => void; disabled?: boolean; size?: number; className?: string }) {
  const first = useRef(true);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (done) setBurst((b) => b + 1);
  }, [done]);
  const c = size / 2;
  return (
    <button
      type="button"
      aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
      aria-pressed={done}
      disabled={disabled}
      data-done={done || undefined}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn("touch-target relative flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-layer-active disabled:pointer-events-none max-md:size-8", className)}
    >
      <span className={cn("flex transition-opacity duration-150", done && "opacity-0")}>
        <TaskStatusIcon status={status === "concluida" ? "a_fazer" : status} size={size} />
      </span>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="pointer-events-none absolute">
        <circle className="motion-check-circle" cx={c} cy={c} r={c - 0.5} fill={stageCategoryColor.done} />
        <path className="motion-check-path" pathLength={1} d={`M${size * 0.3} ${size * 0.52} L${size * 0.44} ${size * 0.66} L${size * 0.7} ${size * 0.38}`} stroke="white" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {burst > 0 && done && <span key={burst} aria-hidden className="motion-burst m-auto size-[calc(100%-4px)]" />}
    </button>
  );
}

/** Título que se risca com um traço desenhado (e esmaece) quando `done`. `multiline`: risco estático + esmaecer (títulos que quebram linha). */
export function DoneTitle({ done, children, className, multiline }: { done: boolean; children: React.ReactNode; className?: string; multiline?: boolean }) {
  if (multiline) return <span className={cn("transition-opacity duration-200", done && "text-fg-subtle line-through opacity-60", className)}>{children}</span>;
  return (
    <span className={cn("motion-strike", done && "text-fg-subtle", className)} data-done={done || undefined}>
      {children}
    </span>
  );
}

export function TaskStatusPill({ value, onChange, size = "md", showLabel = true }: { value: TaskStatusKey; onChange?: (v: TaskStatusKey) => void; size?: "sm" | "md"; showLabel?: boolean }) {
  const label = taskStatus(value).label;
  const pill = (
    <Pill size={size} static={!onChange} pulseKey={value} leading={<TaskStatusIcon status={value} size={12} />} aria-label={`Status: ${label}`}>
      {showLabel ? label : undefined}
    </Pill>
  );
  if (!onChange) return pill;
  return <Combobox options={taskStatusOptions} value={value} onChange={(v) => v && onChange(v)} trigger={pill} contentClassName="w-48" />;
}

/* ───────── Status (badges) ───────── */
const projectStatusTone: Record<ProjectStatus, Tone> = { cotacao: "violet", ativo: "info", concluido: "success", arquivado: "neutral", perdido: "danger", cancelado: "neutral" };
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => <Badge tone={projectStatusTone[status]} pulseKey={status} dot>{PROJECT_STATUS_LABEL[status]}</Badge>;

const receivableTone: Record<ReceivableStatus, Tone> = { previsto: "neutral", faturado: "info", recebido: "success", vencido: "danger", cancelado: "neutral" };
export const ReceivableStatusBadge = ({ status }: { status: ReceivableStatus }) => <Badge tone={receivableTone[status]} pulseKey={status} dot>{RECEIVABLE_STATUS_LABEL[status]}</Badge>;

const payableTone: Record<PayableStatus, Tone> = { aguardando_nf: "warning", em_conferencia: "info", divergente: "danger", aprovado: "accent", pago: "success", cancelado: "neutral" };
export const PayableStatusBadge = ({ status }: { status: PayableStatus }) => <Badge tone={payableTone[status]} pulseKey={status} dot>{PAYABLE_STATUS_LABEL[status]}</Badge>;

const proposalTone: Record<ProposalStatus, Tone> = { rascunho: "neutral", enviada: "info", aprovada: "success", recusada: "danger" };
export const ProposalStatusBadge = ({ status }: { status: ProposalStatus }) => <Badge tone={proposalTone[status]} pulseKey={status}>{PROPOSAL_STATUS_LABEL[status]}</Badge>;

const approvalTone: Record<ApprovalDecision, Tone> = { pendente: "warning", aprovado: "success", ajustes: "orange", negado: "danger" };
export const ApprovalBadge = ({ decision }: { decision: ApprovalDecision }) => <Badge tone={approvalTone[decision]} pulseKey={decision} dot>{APPROVAL_DECISION_LABEL[decision]}</Badge>;

const billingLabel = { sem_faturamento: null, a_faturar: "A faturar", parcial: "Faturado parcial", faturado: "Faturado", recebido: "Recebido", vencido: "Cobrança vencida" } as const;
const billingTone = { a_faturar: "neutral", parcial: "info", faturado: "info", recebido: "success", vencido: "danger" } as const;
export function BillingBadge({ status }: { status: keyof typeof billingLabel }) {
  if (status === "sem_faturamento") return null;
  return (
    <Badge tone={billingTone[status]} icon="receivable" size="xs" pulseKey={status}>
      {billingLabel[status]}
    </Badge>
  );
}

/* ───────── Prazo ───────── */
export function DueChip({ date, done, size = "md", withIcon = true, className }: { date: string | null | undefined; done?: boolean; size?: "sm" | "md"; withIcon?: boolean; className?: string }) {
  if (!date) return null;
  const tone = dueTone(date, done);
  return (
    <Pill size={size} static icon={withIcon ? "due" : undefined} tone={tone === "overdue" ? "danger" : tone === "today" || tone === "soon" ? "warning" : "muted"} className={className}>
      {done ? new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : dueLabel(date)}
    </Pill>
  );
}

/* ───────── Tipo de projeto ───────── */
export function ProjectTypeIcon({ icon, size = "sm", className }: { icon: string; size?: "xs" | "sm" | "md"; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-md bg-layer text-fg-muted", size === "xs" ? "size-5" : size === "sm" ? "size-6" : "size-8", className)}>
      <Icon name={icon as never} size={size === "md" ? "md" : "sm"} />
    </span>
  );
}

/* ───────── Dinheiro (respeita permissão) ───────── */
/** Mostra valor só para perfis com acesso a valores (RF-M1-05); senão, "—" com cadeado. */
export function Money({ cents, className, compact }: { cents: number | null | undefined; className?: string; compact?: boolean }) {
  const { money: allowed } = usePermissions();
  if (!allowed)
    return (
      <span className={cn("inline-flex items-center gap-1 text-fg-placeholder", className)} title="Sem permissão para ver valores">
        <Icon name="lock" size="xs" />
      </span>
    );
  return <span className={cn("tabular-nums", className)}>{compact && cents != null ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100) : money(cents)}</span>;
}

/** Código do projeto em fonte mono discreta (MEM-031). */
export function ProjectCode({ code, className }: { code: string; className?: string }) {
  return <span className={cn("shrink-0 font-mono text-xs text-fg-subtle", className)}>{code}</span>;
}
