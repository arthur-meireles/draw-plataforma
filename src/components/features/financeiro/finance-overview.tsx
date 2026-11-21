"use client";
import { useState } from "react";
import { BarSeriesChart, DonutChart, Money, ProjectCode, RankBars, monthLabel } from "@/components/domain";
import { Badge, DataTable, ErrorState, Section, SegmentedControl, Skeleton, Stat, type Column } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { financeApi } from "@/data/services";
import { money, number, percent } from "@/lib/format";
import { TotalsRow } from "./totals-row";

type Overview = Awaited<ReturnType<typeof financeApi.overview>>;
type ProjectRow = Overview["projects"][number];

const FLOW_SERIES = {
  receber: [
    { key: "previsto", label: "Previsto" },
    { key: "faturado", label: "Faturado" },
    { key: "recebido", label: "Recebido" },
  ],
  pagar: [
    { key: "pagar", label: "A pagar" },
    { key: "pago", label: "Pago" },
  ],
  tudo: [
    { key: "previsto", label: "Previsto" },
    { key: "faturado", label: "Faturado" },
    { key: "recebido", label: "Recebido" },
    { key: "pagar", label: "A pagar" },
    { key: "pago", label: "Pago" },
  ],
} as const;

export function MarginBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-fg-subtle">—</span>;
  const tone = pct >= 0.3 ? "success" : pct >= 0.15 ? "warning" : "danger";
  return <Badge tone={tone}>{percent(pct, 1)}</Badge>;
}

const columns: Column<ProjectRow>[] = [
  { id: "code", header: "Projeto", mobile: "title", sortValue: (r) => r.code, cell: (r) => (
      <span className="flex min-w-0 items-center gap-2">
        <ProjectCode code={r.code} />
        <span className="truncate text-fg">{r.title}</span>
      </span>
    ) },
  { id: "client", header: "Cliente", mobile: "subtitle", hideBelow: "lg", sortValue: (r) => r.clientName, cell: (r) => <span className="text-fg-muted">{r.clientName}</span> },
  { id: "contracted", header: "Contratado", align: "right", mobile: "trailing", sortValue: (r) => r.contractedCents, cell: (r) => <Money cents={r.contractedCents} /> },
  { id: "received", header: "Recebido", align: "right", hideBelow: "md", sortValue: (r) => r.receivedCents, cell: (r) => <Money cents={r.receivedCents} /> },
  { id: "costs", header: "Custos", align: "right", hideBelow: "md", sortValue: (r) => r.freelancerCostCents + r.otherCostCents, cell: (r) => <Money cents={r.freelancerCostCents + r.otherCostCents} /> },
  { id: "margin", header: "Margem", align: "right", sortValue: (r) => r.marginCents, cell: (r) => <Money cents={r.marginCents} className={r.marginCents < 0 ? "text-danger" : undefined} /> },
  { id: "pct", header: "Margem %", align: "right", sortValue: (r) => r.marginPct, cell: (r) => <MarginBadge pct={r.marginPct} /> },
];

export function FinanceOverview({ months }: { months: number }) {
  const q = useApiQuery(["finance", "overview", months], () => financeApi.overview({ months }));
  const [flow, setFlow] = useState<keyof typeof FLOW_SERIES>("tudo");

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const loading = q.isLoading || !d;
  const tot = d?.totals;

  const projectTotals = d?.projects.reduce((a, p) => ({ contracted: a.contracted + p.contractedCents, received: a.received + p.receivedCents, costs: a.costs + p.freelancerCostCents + p.otherCostCents, margin: a.margin + p.marginCents }), { contracted: 0, received: 0, costs: 0, margin: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat loading={loading} label="A receber" icon="receivable" tone="info" value={<Money cents={tot?.toReceive} />} href="/financeiro/receber" hint="em aberto" />
        <Stat loading={loading} label="Vencido" icon="warning" tone="danger" value={<Money cents={tot?.overdue} />} href="/financeiro/receber?status=vencido" hint="cobrar" />
        <Stat loading={loading} label="Recebido no mês" icon="success" tone="success" value={<Money cents={tot?.receivedMonth} />} href="/financeiro/receber?status=recebido" />
        <Stat loading={loading} label="A pagar" icon="payable" tone="warning" value={<Money cents={tot?.toPay} />} href="/financeiro/pagar" hint="em aberto" />
        <Stat loading={loading} label="A pagar no mês" icon="due" tone="orange" value={<Money cents={tot?.toPayMonth} />} href="/financeiro/pagar" />
        <Stat loading={loading} label="NFs aguardando" icon="invoice" tone="neutral" value={tot ? number(tot.awaitingInvoice) : ""} href="/financeiro/pagar?status=aguardando_nf" hint="freelancers" />
        <Stat loading={loading} label="Divergentes" icon="error" tone={tot && tot.divergent ? "danger" : "neutral"} value={tot ? number(tot.divergent) : ""} href="/financeiro/pagar?status=divergente" hint="valor ≠ acordado" />
        <Stat loading={loading} label="Margem total" icon="margin" tone="accent" value={<Money cents={tot?.margin} />} hint={tot && tot.contracted ? `${percent(tot.margin / tot.contracted, 1)} do contratado` : undefined} />
      </div>

      <Section
        title="Fluxo por mês"
        description="Previsto, faturado e recebido contra o que há a pagar e o que foi pago."
        icon="chart"
        actions={
          <SegmentedControl
            aria-label="Séries do gráfico"
            value={flow}
            onChange={setFlow}
            options={[
              { value: "tudo", label: "Tudo" },
              { value: "receber", label: "Receber" },
              { value: "pagar", label: "Pagar" },
            ]}
          />
        }
      >
        {loading ? <Skeleton className="h-60 w-full" /> : <BarSeriesChart data={d.byMonth} xKey="month" xFormat={monthLabel} format="money" height={280} series={[...FLOW_SERIES[flow]]} />}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Receita por cliente" description="Valor contratado, top 10." icon="clients">
          {loading ? <Skeleton className="h-48 w-full" /> : <RankBars format="money" items={d.byClient.map((c) => ({ label: c.label, value: c.contracted, sub: `${c.projects} proj.` }))} />}
        </Section>
        <Section title="Por tipo de projeto" description="Contratado por tipo." icon="chartPie">
          {loading ? <Skeleton className="h-48 w-full" /> : <DonutChart format="money" height={180} data={d.byType.map((x) => ({ label: x.label, value: x.contracted }))} centerLabel="contratado" centerValue={money(tot?.contracted).replace(/,00$/, "")} />}
        </Section>
      </div>

      <Section title="Projetos e margem" description="Clique em um projeto para abrir o financeiro dele." icon="project" bodyClassName="p-0">
        <DataTable
          rows={d?.projects}
          isLoading={loading}
          columns={columns}
          getRowId={(r) => r.projectId}
          rowHref={(r) => `/projetos/${r.code}?aba=financeiro`}
          initialSort={{ id: "contracted", dir: "desc" }}
          pageSize={15}
          empty={{ icon: "project", title: "Nenhum projeto com valor contratado", description: "Aprove uma proposta ou crie um projeto direto para ver a margem aqui." }}
          footer={
            projectTotals && (
              <TotalsRow
                span={2}
                label={`Total · ${d?.projects.length} projetos`}
                cells={[
                  { value: <Money cents={projectTotals.contracted} /> },
                  { value: <Money cents={projectTotals.received} /> },
                  { value: <Money cents={projectTotals.costs} /> },
                  { value: <Money cents={projectTotals.margin} /> },
                  { value: projectTotals.contracted ? percent(projectTotals.margin / projectTotals.contracted, 1) : "—" },
                ]}
              />
            )
          }
        />
      </Section>
    </div>
  );
}
