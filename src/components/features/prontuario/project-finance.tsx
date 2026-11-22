"use client";
import Link from "next/link";
import { Button, DataTable, Section, Stat, type Column } from "@/components/ui";
import { Money, PayableStatusBadge, ReceivableStatusBadge } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiQuery } from "@/data/hooks";
import { financeApi, projectsApi } from "@/data/services";
import { dateFull, percent } from "@/lib/format";
import type { ProjectDetail } from "./use-project";

type Rec = Awaited<ReturnType<typeof financeApi.receivables>>[number];
type Pay = Awaited<ReturnType<typeof financeApi.payables>>[number];

/** Aba "Financeiro" (somente com permissão de valores): indicadores, recebíveis e pagáveis do projeto (RF-M5-06). */
export function ProjectFinance({ project }: { project: ProjectDetail }) {
  const { access } = usePermissions();
  const fin = useApiQuery(["project-financials", project.id], () => projectsApi.financials(project.id));
  const canRec = access("receivables") !== "-";
  const canPay = access("payables") !== "-";
  const recs = useApiQuery(["receivables", "project", project.id], () => financeApi.receivables({ projectId: project.id }), { enabled: canRec });
  const pays = useApiQuery(["payables", "project", project.id], () => financeApi.payables({ projectId: project.id }), { enabled: canPay });
  const f = fin.data;

  const recColumns: Column<Rec>[] = [
    { id: "desc", header: "Descrição", mobile: "title", sortValue: (r) => r.description, cell: (r) => <span className="text-fg">{r.description}</span> },
    { id: "status", header: "Status", mobile: "meta", sortValue: (r) => r.status, cell: (r) => <ReceivableStatusBadge status={r.status} /> },
    { id: "expected", header: "Previsão", mobile: "subtitle", sortValue: (r) => r.expectedAt, cell: (r) => <span className="text-fg-muted">{dateFull(r.expectedAt)}</span> },
    { id: "nf", header: "NF", mobile: "meta", hideBelow: "md", cell: (r) => <span className="text-fg-muted">{r.invoiceNumber ?? "—"}</span> },
    { id: "amount", header: "Valor", align: "right", mobile: "meta", sortValue: (r) => r.amountCents, cell: (r) => <Money cents={r.amountCents} className="font-medium" /> },
  ];
  const payColumns: Column<Pay>[] = [
    { id: "desc", header: "Descrição", mobile: "title", sortValue: (p) => p.description, cell: (p) => <span className="text-fg">{p.description}</span> },
    { id: "who", header: "Favorecido", mobile: "subtitle", sortValue: (p) => p.freelancerName ?? "", cell: (p) => <span className="text-fg-muted">{p.freelancerName ?? (p.kind === "despesa_projeto" ? "Despesa do projeto" : "—")}</span> },
    { id: "status", header: "Status", mobile: "meta", sortValue: (p) => p.status, cell: (p) => <PayableStatusBadge status={p.status} /> },
    { id: "due", header: "Vencimento", mobile: "meta", hideBelow: "md", sortValue: (p) => p.dueAt, cell: (p) => <span className="text-fg-muted">{dateFull(p.dueAt)}</span> },
    { id: "amount", header: "Valor", align: "right", mobile: "meta", sortValue: (p) => p.invoicedAmountCents ?? p.agreedAmountCents, cell: (p) => <Money cents={p.invoicedAmountCents ?? p.agreedAmountCents} className="font-medium" /> },
  ];

  const marginTone = f ? (f.marginCents < 0 ? "danger" : f.marginPct != null && f.marginPct < 0.2 ? "warning" : "success") : undefined;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {fin.error ? (
        <Section title="Resumo financeiro" icon="finance"><p className="text-sm text-danger">{fin.error.message}</p><Button className="mt-2" size="sm" icon="refresh" onClick={() => fin.refetch()}>Tentar novamente</Button></Section>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Contratado" icon="money" value={<Money cents={f?.contractedCents} />} loading={fin.isLoading} />
          <Stat label="Faturado" icon="invoice" value={<Money cents={f?.invoicedCents} />} loading={fin.isLoading} hint={f ? `de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format((f.expectedCents ?? 0) / 100)} previstos` : undefined} />
          <Stat label="Recebido" icon="receivable" tone="success" value={<Money cents={f?.receivedCents} />} loading={fin.isLoading} />
          <Stat label="A receber" icon="time" value={<Money cents={f?.toReceiveCents} />} loading={fin.isLoading} />
          <Stat label="Custo de freelancers" icon="freelancer" value={<Money cents={f?.freelancerCostCents} />} loading={fin.isLoading} />
          <Stat label="Outros custos" icon="payable" value={<Money cents={f?.otherCostCents} />} loading={fin.isLoading} />
          <Stat label="Margem" icon="margin" tone={marginTone} value={<Money cents={f?.marginCents} />} loading={fin.isLoading} />
          <Stat label="Margem %" icon="chartPie" tone={marginTone} value={f?.marginPct != null ? percent(f.marginPct, 1) : "—"} loading={fin.isLoading} hint="sobre o valor contratado" />
        </div>
      )}

      {canRec && (
        <Section
          title="Contas a receber"
          icon="receivable"
          actions={<Button asChild size="sm" variant="ghost" iconRight="arrowRight"><Link href={`/financeiro/receber?projeto=${project.code}`}>Abrir no financeiro</Link></Button>}
          bodyClassName="p-0"
        >
          <DataTable rows={recs.data} columns={recColumns} getRowId={(r) => r.id} isLoading={recs.isLoading} error={recs.error} onRetry={() => recs.refetch()} empty={{ compact: true, icon: "receivable", title: "Nenhum recebível", description: "Os recebíveis nascem das parcelas da proposta aprovada." }} />
        </Section>
      )}
      {canPay && (
        <Section title="Contas a pagar" icon="payable" bodyClassName="p-0">
          <DataTable rows={pays.data} columns={payColumns} getRowId={(p) => p.id} isLoading={pays.isLoading} error={pays.error} onRetry={() => pays.refetch()} empty={{ compact: true, icon: "payable", title: "Nenhum pagamento", description: "Ao concluir o projeto, o sistema gera a conta a pagar de cada freelancer com valor combinado." }} />
        </Section>
      )}
    </div>
  );
}
