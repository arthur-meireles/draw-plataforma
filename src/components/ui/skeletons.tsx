"use client";
/**
 * Presets de carregamento estrutural (Lei 9): imitam o layout final para que a tela nunca fique em branco
 * nem dependa de spinner. Use no `fallback` de Suspense, em `loading.tsx` e enquanto as queries carregam.
 *
 * - ListPageSkeleton    → cabeçalho + barra de filtros + linhas de tabela
 * - DetailPageSkeleton  → cabeçalho + bloco do registro + abas + duas colunas (conteúdo | propriedades)
 * - DashboardSkeleton   → grade de KPIs + seções de gráficos
 * - KanbanSkeleton      → colunas com cartões
 * - FormSkeleton        → seções com campos
 * - TableRowsSkeleton / CardGridSkeleton / StatGridSkeleton → peças menores reutilizáveis
 */
import { cn } from "@/lib/cn";
import { Skeleton } from "./display";

/** Barra do cabeçalho de página (h-12) com migalhas e ação. */
export function PageHeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div aria-hidden className="flex h-header shrink-0 items-center gap-2 border-b border-line bg-surface px-3 md:px-4">
      <Skeleton className="h-4 w-4 rounded-sm" />
      <Skeleton className="h-4 w-32" />
      <span className="flex-1" />
      {Array.from({ length: actions }).map((_, i) => (
        <Skeleton key={i} className={cn("h-7 rounded-full", i === actions - 1 ? "w-28" : "w-16 max-md:hidden")} />
      ))}
    </div>
  );
}

/** Barra de filtros (busca + chips). */
export function ToolbarSkeleton({ chips = 3 }: { chips?: number }) {
  return (
    <div aria-hidden className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 md:px-4">
      <Skeleton className="h-7 w-56 max-md:w-40" />
      {Array.from({ length: chips }).map((_, i) => (
        <Skeleton key={i} className="h-7 w-20" />
      ))}
    </div>
  );
}

/** Linhas de tabela (desktop) / cartões (celular). */
export function TableRowsSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("divide-y divide-line", className)}>
      <div className="flex h-9 items-center gap-4 bg-surface-2 px-4 max-md:hidden">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-40" />
        <span className="flex-1" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 max-md:flex-col max-md:items-start max-md:gap-2">
          <Skeleton className="h-4 w-20 max-md:hidden" />
          <Skeleton className={cn("h-4 flex-1 max-md:w-3/4 max-md:flex-none", i % 3 === 1 && "max-w-[60%]", i % 3 === 2 && "max-w-[75%]")} />
          <Skeleton className="h-5 w-24 max-md:w-1/2" />
          <Skeleton className="h-4 w-16 max-md:hidden" />
        </div>
      ))}
    </div>
  );
}

/** Grade de cartões de KPI. */
export function StatGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4 max-sm:p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-6" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Seção com título e corpo (gráfico, lista). */
export function SectionSkeleton({ height = "h-60", className }: { height?: string; className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-xl border border-line bg-surface", className)}>
      <div className="flex min-h-11 items-center gap-2 border-b border-line px-4 py-2">
        <Skeleton className="h-4 w-36" />
        <span className="flex-1" />
        <Skeleton className="h-6 w-20" />
      </div>
      <div className="p-4">
        <Skeleton className={cn("w-full", height)} />
      </div>
    </div>
  );
}

/** Grade de cartões (recursos, pastas, arquivos). */
export function CardGridSkeleton({ count = 6, className, cardClassName = "h-36" }: { count?: number; className?: string; cardClassName?: string }) {
  return (
    <div aria-hidden className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("space-y-3 rounded-xl border border-line bg-surface p-4", cardClassName)}>
          <div className="flex items-center gap-2">
            <Skeleton className="size-8" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** Colunas de kanban com cartões. */
export function KanbanSkeleton({ columns = 4, className }: { columns?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex min-h-0 flex-1 gap-3 overflow-hidden p-3 md:p-4", className)}>
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className={cn("w-column shrink-0 space-y-2 rounded-lg bg-layer/70 p-2 max-md:w-full", c > 0 && "max-md:hidden")}>
          <div className="flex items-center gap-2 px-1 pb-1 pt-0.5">
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-4" />
          </div>
          {Array.from({ length: 3 - (c % 2) }).map((_, i) => (
            <div key={i} className="space-y-2.5 rounded-lg border border-line bg-surface p-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className={cn("h-4", i % 2 ? "w-3/4" : "w-full")} />
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-16" />
                <span className="flex-1" />
                <Skeleton className="size-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Página de listagem: cabeçalho + filtros + tabela. */
export function ListPageSkeleton({ rows = 8, chips = 3, header = true }: { rows?: number; chips?: number; header?: boolean }) {
  return (
    <div role="status" aria-label="Carregando" className="flex min-h-0 flex-1 flex-col">
      {header && <PageHeaderSkeleton />}
      <ToolbarSkeleton chips={chips} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <TableRowsSkeleton rows={rows} />
      </div>
    </div>
  );
}

/** Bloco do registro + abas + duas colunas (conteúdo à esquerda, propriedades à direita). */
export function DetailBodySkeleton({ tabs = 5 }: { tabs?: number }) {
  return (
    <div aria-hidden className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-7 w-2/3 max-md:w-full" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-28" />
        </div>
      </div>
      <div className="flex gap-4 border-b border-line pb-2.5">
        {Array.from({ length: tabs }).map((_, i) => (
          <Skeleton key={i} className={cn("h-4", i === 0 ? "w-20" : "w-16", i > 2 && "max-sm:hidden")} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4 max-xl:order-2">
          <SectionSkeleton height="h-32" />
          <SectionSkeleton height="h-48" />
        </div>
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4 max-xl:order-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[7.5rem_1fr] items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Página de detalhe completa (cabeçalho + corpo). */
export function DetailPageSkeleton({ tabs = 5, header = true }: { tabs?: number; header?: boolean }) {
  return (
    <div role="status" aria-label="Carregando" className="flex min-h-0 flex-1 flex-col">
      {header && <PageHeaderSkeleton actions={2} />}
      <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-6">
        <DetailBodySkeleton tabs={tabs} />
      </div>
    </div>
  );
}

/** Corpo de painel: KPIs + gráficos. */
export function DashboardBodySkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div aria-hidden className="space-y-6">
      <StatGridSkeleton count={stats} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
      <SectionSkeleton height="h-40" />
    </div>
  );
}

/** Página de painel completa. */
export function DashboardSkeleton({ stats = 4, header = true }: { stats?: number; header?: boolean }) {
  return (
    <div role="status" aria-label="Carregando" className="flex min-h-0 flex-1 flex-col">
      {header && <PageHeaderSkeleton actions={2} />}
      <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-6">
        <DashboardBodySkeleton stats={stats} />
      </div>
    </div>
  );
}

/** Seções com campos de formulário. */
export function FormSkeleton({ sections = 2, fields = 4, className }: { sections?: number; fields?: number; className?: string }) {
  return (
    <div role="status" aria-label="Carregando" className={cn("space-y-6", className)}>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className="rounded-xl border border-line bg-surface">
          <div className="flex min-h-11 items-center border-b border-line px-4 py-2">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {Array.from({ length: fields }).map((_, i) => (
              <div key={i} className={cn("space-y-1.5", i === fields - 1 && fields % 2 === 1 && "sm:col-span-2")}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Página de formulário/configuração completa. */
export function FormPageSkeleton({ sections = 2, header = true }: { sections?: number; header?: boolean }) {
  return (
    <div role="status" aria-label="Carregando" className="flex min-h-0 flex-1 flex-col">
      {header && <PageHeaderSkeleton />}
      <div className="min-h-0 flex-1 overflow-hidden p-3 md:p-6">
        <FormSkeleton sections={sections} className="mx-auto max-w-3xl" />
      </div>
    </div>
  );
}

/** Página de quadro: cabeçalho + filtros + colunas. */
export function BoardPageSkeleton({ header = true }: { header?: boolean }) {
  return (
    <div role="status" aria-label="Carregando" className="flex min-h-0 flex-1 flex-col">
      {header && <PageHeaderSkeleton actions={2} />}
      <ToolbarSkeleton />
      <KanbanSkeleton />
    </div>
  );
}

/**
 * Chassi inteiro enquanto a sessão carrega (recarregar a página): rail + painel + listagem.
 * Feito para substituir o spinner de `AppShell` (components/layout) — a troca fica com quem cuida do chassi.
 */
export function AppShellSkeleton() {
  return (
    <div role="status" aria-label="Carregando" className="flex h-dvh overflow-hidden bg-canvas">
      <div aria-hidden className="flex w-rail shrink-0 flex-col items-center gap-4 py-3 max-md:hidden">
        <Skeleton className="size-8 rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="size-8 rounded-lg" />
        ))}
      </div>
      <div aria-hidden className="w-sidebar shrink-0 space-y-3 p-3 max-xl:hidden">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-9 w-full rounded-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface xl:my-2 xl:mr-2 xl:rounded-lg xl:border xl:border-line">
        <ListPageSkeleton />
      </div>
    </div>
  );
}
