"use client";
/** Estrutura de página: PageHeader (barra h-12 estilo Plane), Breadcrumb, Toolbar, FilterChip, PageBody, ViewSwitcher. */
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import { Button } from "./button";
import { SegmentedControl } from "./select";
import { useLayout } from "@/components/layout/layout-context";

export interface Crumb {
  label: string;
  href?: string;
  icon?: IconName;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Navegação estrutural" className="flex min-w-0 items-center gap-1 text-sm">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${c.label}-${i}`} className={cn("flex min-w-0 items-center gap-1", !last && "max-sm:hidden")}>
            {i > 0 && <Icon name="chevronRight" size="xs" className="shrink-0 text-fg-placeholder max-sm:hidden" />}
            {c.href && !last ? (
              <Link href={c.href} className="flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-fg-subtle hover:bg-layer-hover hover:text-fg">
                {c.icon && <Icon name={c.icon} size="sm" />}
                <span className="truncate">{c.label}</span>
              </Link>
            ) : (
              <span aria-current={last ? "page" : undefined} className={cn("flex min-w-0 items-center gap-1.5 px-1", last ? "font-medium text-fg" : "text-fg-subtle")}>
                {c.icon && <Icon name={c.icon} size="sm" className={last ? "text-fg-subtle" : ""} />}
                <span className="truncate">{c.label}</span>
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * Cabeçalho de página fixo (h-12). À esquerda: botão de menu (mobile/tablet) + breadcrumb + contagem.
 * À direita: ações (visão, filtros, ação primária). No celular, ações secundárias devem ir para `mobileActions`.
 */
export function PageHeader({ crumbs, count, actions, className }: { crumbs: Crumb[]; count?: number; actions?: React.ReactNode; className?: string }) {
  const { openMobileNav } = useLayout();
  return (
    <header className={cn("sticky top-0 z-20 flex h-header shrink-0 items-center gap-2 border-b border-line bg-surface px-3 md:px-4", className)}>
      <button type="button" onClick={openMobileNav} aria-label="Abrir menu" className="-ml-1 flex size-9 items-center justify-center rounded-md text-fg-subtle hover:bg-layer-hover hover:text-fg xl:hidden max-md:hidden">
        <Icon name="sidebar" size="md" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Breadcrumb items={crumbs} />
        {count != null && <span className="rounded-sm bg-layer px-1.5 py-0.5 text-xs tabular-nums text-fg-subtle">{count}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

/** Barra de filtros abaixo do cabeçalho (busca + chips + ações). Rola horizontalmente no celular. */
export function Toolbar({ children, className, end }: { children: React.ReactNode; className?: string; end?: React.ReactNode }) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 md:px-4", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 max-md:flex-nowrap max-md:overflow-x-auto max-md:scrollbar-none">{children}</div>
      {end && <div className="flex items-center gap-2">{end}</div>}
    </div>
  );
}

/** Chip de filtro (gatilho de dropdown). Ativo mostra o valor e um "x" para limpar. */
export function FilterChip({ label, value, icon, onClear, active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; value?: string | null; icon?: IconName; onClear?: () => void; active?: boolean }) {
  const isActive = active ?? !!value;
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center rounded-md border text-xs transition-colors max-md:h-10", isActive ? "border-accent-line bg-accent-subtle text-accent" : "border-dashed border-line-strong text-fg-subtle hover:border-solid hover:bg-layer-hover hover:text-fg")}>
      <button type="button" className="flex h-full items-center gap-1.5 px-2" {...props}>
        {icon && <Icon name={icon} size="xs" />}
        <span>{label}</span>
        {value && (
          <>
            <span className="opacity-50">:</span>
            <span className="max-w-32 truncate font-medium">{value}</span>
          </>
        )}
        {!value && <Icon name="chevronDown" size="xs" />}
      </button>
      {isActive && onClear && (
        <button type="button" aria-label={`Limpar filtro ${label}`} onClick={onClear} className="flex h-full items-center border-l border-accent-line px-1.5 hover:bg-accent/10">
          <Icon name="close" size="xs" />
        </button>
      )}
    </span>
  );
}

export function ClearFiltersButton({ onClick, show }: { onClick: () => void; show: boolean }) {
  if (!show) return null;
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="shrink-0">
      Limpar filtros
    </Button>
  );
}

/** Corpo rolável da página. `padded` para páginas de conteúdo; sem padding para kanban/tabelas full-bleed. */
export function PageBody({ children, className, padded = true, width = "full" }: { children: React.ReactNode; className?: string; padded?: boolean; width?: "full" | "content" | "narrow" }) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto scrollbar-thin", className)}>
      <div className={cn(padded && "p-3 md:p-6", width === "content" && "mx-auto max-w-6xl", width === "narrow" && "mx-auto max-w-3xl", "max-md:pb-24")}>{children}</div>
    </div>
  );
}

export type ViewMode = "lista" | "kanban" | "calendario" | "gantt";
const VIEW_OPTIONS: { value: ViewMode; label: string; icon: IconName }[] = [
  { value: "lista", label: "Lista", icon: "viewList" },
  { value: "kanban", label: "Kanban", icon: "viewKanban" },
  { value: "calendario", label: "Calendário", icon: "viewCalendar" },
  { value: "gantt", label: "Gantt", icon: "viewGantt" },
];

export function ViewSwitcher({ value, onChange, views = ["lista", "kanban"] }: { value: ViewMode; onChange: (v: ViewMode) => void; views?: ViewMode[] }) {
  return <SegmentedControl aria-label="Visualização" value={value} onChange={onChange} options={VIEW_OPTIONS.filter((o) => views.includes(o.value)).map((o) => ({ ...o, iconOnly: true }))} />;
}

/** Botão flutuante de ação principal no celular (10.6). */
export function Fab({ label, icon = "add", onClick, href }: { label: string; icon?: IconName; onClick?: () => void; href?: string }) {
  const cls = "fixed bottom-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom)+1rem)] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-accent-solid text-accent-fg shadow-overlay active:scale-95 transition-transform md:hidden";
  if (href)
    return (
      <Link href={href} aria-label={label} className={cls}>
        <Icon name={icon} size="lg" />
      </Link>
    );
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      <Icon name={icon} size="lg" />
    </button>
  );
}
