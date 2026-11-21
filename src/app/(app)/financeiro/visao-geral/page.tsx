"use client";
import { Suspense } from "react";
import { FinanceOverview } from "@/components/features/financeiro/finance-overview";
import { PageBody, PageHeader, SegmentedControl, Skeleton } from "@/components/ui";
import { useUrlState } from "@/lib/use-url-state";

const PERIODS = [
  { value: "3", label: "3 meses" },
  { value: "6", label: "6 meses" },
  { value: "12", label: "12 meses" },
];

function Content() {
  const [{ meses }, set] = useUrlState({ meses: "6" });
  const months = [3, 6, 12].includes(Number(meses)) ? Number(meses) : 6;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Financeiro", icon: "finance", href: "/financeiro/visao-geral" }, { label: "Visão geral" }]}
        actions={<SegmentedControl aria-label="Período" value={String(months)} onChange={(v) => set({ meses: v })} options={PERIODS} />}
      />
      <PageBody>
        <FinanceOverview months={months} />
      </PageBody>
    </>
  );
}

export default function FinanceOverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-64" />}>
      <Content />
    </Suspense>
  );
}
