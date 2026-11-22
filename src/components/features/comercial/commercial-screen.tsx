"use client";
/** Tela do funil comercial (RF-M3-01): resumo + filtros + kanban ou lista. */
import Link from "next/link";
import { Button, ErrorState, Fab, PageBody, PageHeader, ViewSwitcher, type ViewMode } from "@/components/ui";
import { useIsMobile } from "@/lib/use-media-query";
import { QuoteBoard } from "./quote-board";
import { QuoteFiltersBar } from "./quote-filters";
import { QuoteList } from "./quote-list";
import { QuoteSummary } from "./quote-summary";
import { useQuoteFilters, useQuotes } from "./use-quotes";

const NEW_QUOTE = "/projetos/novo?origem=cotacao";

export function CommercialScreen() {
  const filters = useQuoteFilters();
  const q = useQuotes(filters.filters);
  const mobile = useIsMobile();
  const view: ViewMode = filters.state.visao === "kanban" || filters.state.visao === "lista" ? filters.state.visao : mobile ? "lista" : "kanban";
  const canCreate = !!q.data?.canMove;
  const openCount = q.data?.items.filter((i) => i.status === "cotacao").length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Comercial", icon: "commercial" }, { label: "Funil de cotações" }]}
        count={openCount}
        actions={
          <>
            <ViewSwitcher value={view} onChange={(v) => filters.set({ visao: v })} views={["lista", "kanban"]} />
            {canCreate && (
              <Button asChild variant="primary" size="sm" className="max-md:hidden">
                <Link href={NEW_QUOTE}>Nova cotação</Link>
              </Button>
            )}
          </>
        }
      />
      <QuoteSummary items={q.data?.items} loading={q.isLoading} />
      <QuoteFiltersBar filters={filters} />
      {q.error ? (
        <PageBody>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </PageBody>
      ) : view === "kanban" ? (
        <div className="min-h-0 flex-1 overflow-hidden bg-surface-2">
          <QuoteBoard items={q.data?.items} isLoading={q.isLoading} canMove={canCreate} />
        </div>
      ) : (
        <PageBody padded={false}>
          <QuoteList items={q.data?.items} isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} canMove={canCreate} hasFilters={filters.filterCount > 0} onClear={filters.clear} />
        </PageBody>
      )}
      {canCreate && <Fab label="Nova cotação" href={NEW_QUOTE} />}
    </>
  );
}
