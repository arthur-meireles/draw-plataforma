"use client";
/** "Projetos por etapa" — barras horizontais dos projetos ativos. */
import { EmptyState, Section, Skeleton } from "@/components/ui";
import { BarSeriesChart } from "@/components/domain";
import { useApiQuery } from "@/data/hooks";
import { metricsApi } from "@/data/services";

export function ProjectsByStage() {
  const q = useApiQuery(["metrics", "dashboard"], metricsApi.dashboard);
  const data = q.data?.byStage ?? [];
  const total = data.reduce((a, s) => a + s.count, 0);
  return (
    <Section title="Projetos por etapa" icon="chart" description={q.data ? `${total} projetos ativos` : undefined}>
      {q.isLoading ? <Skeleton className="h-60" /> : !total ? <EmptyState compact icon="project" title="Nenhum projeto ativo" description="Aprove uma proposta ou crie um projeto direto." /> : <BarSeriesChart data={data} xKey="label" series={[{ key: "count", label: "Projetos" }]} horizontal height={Math.max(180, data.length * 30)} />}
    </Section>
  );
}
