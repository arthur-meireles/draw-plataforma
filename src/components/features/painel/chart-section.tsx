"use client";
/** Bloco do painel: título, fórmula em uma linha, skeleton, vazio, erro e "Exportar CSV". */
import { EmptyState, ErrorState, Section, Skeleton, type IconName } from "@/components/ui";
import type { CsvCell } from "@/lib/csv";
import { ExportCsvButton } from "./export-csv-button";

export interface CsvSpec {
  filename: string;
  headers: string[];
  rows: CsvCell[][];
}

export function ChartSection({ title, formula, icon = "chart", loading, error, onRetry, empty, emptyText = "Sem dados no período", csv, children, className, skeletonHeight = "h-56" }: {
  title: string;
  formula: string;
  icon?: IconName;
  loading?: boolean;
  error?: { message?: string; status?: number } | null;
  onRetry?: () => void;
  /** Verdadeiro quando não há o que mostrar. */
  empty?: boolean;
  emptyText?: string;
  csv?: CsvSpec;
  children: React.ReactNode;
  className?: string;
  skeletonHeight?: string;
}) {
  return (
    <Section title={title} description={formula} icon={icon} className={className} actions={csv && !loading && !error ? <ExportCsvButton {...csv} disabled={empty} /> : undefined}>
      {error ? <ErrorState error={error} onRetry={onRetry} /> : loading ? <Skeleton className={skeletonHeight} /> : empty ? <EmptyState compact icon="chart" title={emptyText} description="Ajuste o período ou os filtros para ver este indicador." /> : children}
    </Section>
  );
}
