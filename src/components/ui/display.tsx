"use client";
/** Exibição: Badge, Pill, Avatar, AvatarStack, Skeleton, Spinner, Progress, Kbd, Separator, Card, Section, Stat, PropertyRow, EmptyState, ErrorState, Tabs. */
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { Tooltip } from "./overlay";

/* ───────── Badge ───────── */
export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "violet" | "orange";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-layer text-fg-muted border-line",
  accent: "bg-accent-subtle text-accent border-accent-line",
  success: "bg-success-subtle text-success border-transparent",
  warning: "bg-warning-subtle text-warning border-transparent",
  danger: "bg-danger-subtle text-danger border-transparent",
  info: "bg-info-subtle text-info border-transparent",
  violet: "bg-violet-subtle text-violet border-transparent",
  orange: "bg-warning-subtle text-orange border-transparent",
};

export function Badge({ tone = "neutral", icon, dot, children, className, size = "sm" }: { tone?: Tone; icon?: IconName; dot?: boolean; children: React.ReactNode; className?: string; size?: "xs" | "sm" }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border font-medium", size === "xs" ? "h-[18px] px-1 text-2xs" : "h-5 px-1.5 text-xs", toneClasses[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {icon && <Icon name={icon} size="xs" />}
      {children}
    </span>
  );
}

/* ───────── Pill (propriedade clicável estilo Plane) ───────── */
export const Pill = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName; leading?: React.ReactNode; tone?: "default" | "danger" | "warning" | "muted"; size?: "sm" | "md"; static?: boolean }>(
  function Pill({ icon, leading, tone = "default", size = "md", children, className, static: isStatic, ...props }, ref) {
    const cls = cn(
      "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md border border-line bg-layer-2 text-xs text-fg-muted transition-colors",
      size === "sm" ? "h-5 px-1" : "h-6 px-1.5 max-md:h-7",
      !isStatic && "hover:border-line-strong hover:bg-layer-hover cursor-pointer",
      tone === "danger" && "text-danger",
      tone === "warning" && "text-warning",
      tone === "muted" && "text-fg-subtle",
      className,
    );
    const content = (
      <>
        {leading ?? (icon && <Icon name={icon} size="xs" />)}
        {children && <span className="truncate">{children}</span>}
      </>
    );
    if (isStatic) return <span className={cls}>{content}</span>;
    return (
      <button ref={ref} type="button" className={cls} {...props}>
        {content}
      </button>
    );
  },
);

/* ───────── Avatar ───────── */
const avatarSizes = { xs: "size-4 text-[7px] tracking-tighter", sm: "size-5 text-[8px] tracking-tight", md: "size-6 text-[10px]", lg: "size-8 text-xs", xl: "size-12 text-base" };

export function Avatar({ name, color, src, size = "md", className, tooltip = false }: { name: string; color?: string | null; src?: string | null; size?: keyof typeof avatarSizes; className?: string; tooltip?: boolean }) {
  const el = (
    <AvatarPrimitive.Root className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white", avatarSizes[size], className)} style={{ backgroundColor: color ?? "var(--fg-subtle)" }}>
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback delayMs={src ? 300 : 0}>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
  return tooltip ? <Tooltip content={name}>{el}</Tooltip> : el;
}

export function AvatarStack({ people, max = 3, size = "sm" }: { people: { id: string; name: string; color?: string | null }[]; max?: number; size?: keyof typeof avatarSizes }) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <Tooltip content={people.map((p) => p.name).join(", ")}>
      <span className="flex items-center -space-x-1">
        {shown.map((p) => (
          <Avatar key={p.id} name={p.name} color={p.color} size={size} className="ring-2 ring-layer-2" />
        ))}
        {rest > 0 && <span className={cn("inline-flex items-center justify-center rounded-full bg-layer-active font-medium text-fg-muted ring-2 ring-layer-2", avatarSizes[size])}>+{rest}</span>}
      </span>
    </Tooltip>
  );
}

/* ───────── Carregamento ───────── */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-layer-active/70", className)} />;
}

export function Spinner({ className, label = "Carregando" }: { className?: string; label?: string }) {
  return <Icon name="loading" spin label={label} className={cn("text-fg-subtle", className)} />;
}

export function Progress({ value, max = 100, tone = "accent", className, label }: { value: number; max?: number; tone?: "accent" | "success" | "warning" | "danger"; className?: string; label?: string }) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const bar = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className={cn("h-1.5 w-full overflow-hidden rounded-full bg-layer-active", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-300", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Anel de progresso compacto (subtarefas no cartão). */
export function ProgressRing({ value, max, size = 14 }: { value: number; max: number; size?: number }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  const pct = max ? value / max : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={2} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? "var(--success)" : "var(--accent)"} strokeWidth={2} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" />
    </svg>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line-strong bg-surface px-1 font-mono text-2xs text-fg-subtle">{children}</kbd>;
}

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" className={cn("shrink-0 bg-line", vertical ? "h-4 w-px" : "h-px w-full", className)} />;
}

/* ───────── Superfícies ───────── */
export function Card({ className, children, interactive, ...props }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface", interactive && "transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised-2 cursor-pointer", className)} {...props}>
      {children}
    </div>
  );
}

/** Bloco com título (usado em prontuário, fichas, configurações). */
export function Section({ title, description, actions, children, className, bodyClassName, icon }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; icon?: IconName }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)}>
      <header className="flex min-h-11 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        {icon && <Icon name={icon} size="sm" className="text-fg-subtle" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="text-xs text-fg-subtle">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** KPI compacto. */
export function Stat({ label, value, hint, icon, tone, trend, href, onClick, loading }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: IconName; tone?: Tone; trend?: { value: string; up: boolean; good?: boolean }; href?: string; onClick?: () => void; loading?: boolean }) {
  const Comp = href ? Link : onClick ? "button" : "div";
  return (
    <Comp href={href as string} onClick={onClick} type={onClick ? "button" : undefined} className={cn("flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4 text-left", (href || onClick) && "transition-colors hover:border-line-strong hover:bg-surface-2")}>
      <div className="flex items-center gap-2 text-xs font-medium text-fg-subtle">
        {icon && (
          <span className={cn("flex size-6 items-center justify-center rounded-md", tone ? toneClasses[tone] : "bg-layer text-fg-muted")}>
            <Icon name={icon} size="sm" />
          </span>
        )}
        <span className="truncate">{label}</span>
      </div>
      {loading ? <Skeleton className="h-7 w-24" /> : <div className="truncate text-xl font-semibold tabular-nums text-fg">{value}</div>}
      {(hint || trend) && (
        <div className="flex items-center gap-1.5 text-xs text-fg-subtle">
          {trend && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", (trend.good ?? trend.up) ? "text-success" : "text-danger")}>
              <Icon name={trend.up ? "trendUp" : "trendDown"} size="xs" />
              {trend.value}
            </span>
          )}
          {hint}
        </div>
      )}
    </Comp>
  );
}

/** Linha de propriedade (rótulo à esquerda, valor/controle à direita) — sidebar do prontuário. */
export function PropertyRow({ label, icon, children, className }: { label: string; icon?: IconName; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-h-8 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-2 text-sm", className)}>
      <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
        {icon && <Icon name={icon} size="sm" />}
        {label}
      </span>
      <div className="min-w-0 text-fg">{children}</div>
    </div>
  );
}

/** Lista descritiva simples (chave: valor). */
export function DescriptionList({ items, columns = 2 }: { items: { label: string; value: React.ReactNode; hidden?: boolean }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>
      {items.filter((i) => !i.hidden).map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-fg-subtle">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-fg">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────── Estados ───────── */
export function EmptyState({ icon = "inbox", title, description, action, secondaryAction, compact, className }: { icon?: IconName; title: string; description?: React.ReactNode; action?: { label: string; onClick?: () => void; href?: string; icon?: IconName }; secondaryAction?: { label: string; onClick?: () => void; href?: string }; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-16", className)}>
      <span className={cn("flex items-center justify-center rounded-xl border border-line bg-layer text-fg-subtle", compact ? "size-10" : "size-14")}>
        <Icon name={icon} size={compact ? "md" : "lg"} />
      </span>
      <div className="max-w-sm space-y-1">
        <p className={cn("font-semibold text-fg", compact ? "text-sm" : "text-base")}>{title}</p>
        {description && <p className="text-sm text-fg-subtle">{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action &&
            (action.href ? (
              <Button asChild variant="primary" size="sm">
                <Link href={action.href}>
                  {action.icon && <Icon name={action.icon} size="sm" />}
                  {action.label}
                </Link>
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={action.icon} onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
          {secondaryAction &&
            (secondaryAction.href ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}

export function ErrorState({ title = "Não foi possível carregar", error, onRetry, className }: { title?: string; error?: { message?: string; status?: number } | null; onRetry?: () => void; className?: string }) {
  const notFound = error?.status === 404;
  const forbidden = error?.status === 403;
  return (
    <EmptyState
      className={className}
      icon={notFound ? "search" : forbidden ? "lock" : "warning"}
      title={notFound ? "Não encontrado" : forbidden ? "Acesso restrito" : title}
      description={
        notFound
          ? "O item não existe ou você não tem acesso a ele."
          : forbidden
            ? "Seu perfil não tem permissão para ver esta área. Fale com a administração se precisar de acesso."
            : (error?.message ?? "Verifique sua conexão e tente novamente.")
      }
      action={notFound || forbidden ? { label: "Voltar ao início", href: "/" } : onRetry ? { label: "Tentar novamente", onClick: onRetry, icon: "refresh" } : undefined}
    />
  );
}

/* ───────── Tabs ───────── */
export interface TabItem<V extends string = string> {
  value: V;
  label: string;
  icon?: IconName;
  count?: number;
  hidden?: boolean;
}

/** Abas sublinhadas (estilo Plane). Roláveis no celular. */
/** Detecta conteúdo rolável horizontalmente para mostrar esmaecimento nas bordas. */
function useHorizontalOverflow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);
  return { ref, edges };
}

/** Abas sublinhadas (estilo Plane). Roláveis, com esmaecimento indicando mais abas; aba ativa entra na tela. */
export function Tabs<V extends string>({ value, onChange, items, children, className, listClassName }: { value: V; onChange: (v: V) => void; items: TabItem<V>[]; children?: React.ReactNode; className?: string; listClassName?: string }) {
  const { ref, edges } = useHorizontalOverflow<HTMLDivElement>();
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-state=active]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value, ref]);
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onChange(v as V)} className={className}>
      <div className="relative">
        <TabsPrimitive.List ref={ref} className={cn("flex items-center gap-1 overflow-x-auto border-b border-line px-4 scrollbar-none", listClassName)}>
          {items.filter((i) => !i.hidden).map((i) => (
            <TabsPrimitive.Trigger
              key={i.value}
              value={i.value}
              className="relative flex h-10 shrink-0 items-center gap-1.5 px-2 text-sm text-fg-subtle transition-colors hover:text-fg data-[state=active]:text-fg data-[state=active]:after:absolute data-[state=active]:after:inset-x-1 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent"
            >
              {i.icon && <Icon name={i.icon} size="sm" />}
              {i.label}
              {i.count != null && <span className="rounded-sm bg-layer px-1 text-2xs tabular-nums text-fg-subtle">{i.count}</span>}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {edges.left && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent" />}
        {edges.right && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" />}
      </div>
      {children}
    </TabsPrimitive.Root>
  );
}
export const TabPanel = TabsPrimitive.Content;
