"use client";
/** KPIs do Início (RF-M8-01): cada um leva à tela filtrada correspondente. */
import { ErrorState, Stat } from "@/components/ui";
import { Money } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiQuery } from "@/data/hooks";
import { metricsApi } from "@/data/services";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";

export function HomeStats() {
  const { money, access } = usePermissions();
  const q = useApiQuery(["metrics", "dashboard"], metricsApi.dashboard);
  const finance = money && access("receivables") === "T";
  const d = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const overdue = d?.overdueProjects.length ?? 0;
  const week = d?.dueThisWeek.length ?? 0;
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", finance ? "xl:grid-cols-6" : "xl:grid-cols-4")}>
      <Stat loading={q.isLoading} icon="project" label="Projetos ativos" value={d?.activeCount} href="/projetos" hint={d ? plural(d.overdueTasks, "tarefa atrasada", "tarefas atrasadas") : undefined} />
      <Stat loading={q.isLoading} icon="warning" tone={overdue ? "danger" : "success"} label="Projetos atrasados" value={overdue} href="/projetos?prazo=atrasado" hint={overdue ? "Precisam de atenção" : "Tudo no prazo"} />
      <Stat loading={q.isLoading} icon="delivery" tone="info" label="Entregas da semana" value={week} href="/projetos?prazo=semana" hint="Próximos 7 dias" />
      <Stat loading={q.isLoading} icon="commercial" tone="violet" label="Cotações abertas" value={d?.openQuotes} href="/comercial" hint={money && d?.openQuotesValue != null ? <><Money cents={d.openQuotesValue} compact /> em propostas</> : undefined} />
      {finance && <Stat loading={q.isLoading} icon="receivable" tone="success" label="A receber no mês" value={<Money cents={d?.receivableMonth} compact />} href="/financeiro/receber" hint="Vencimentos do mês" />}
      {finance && <Stat loading={q.isLoading} icon="payable" tone="warning" label="A pagar no mês" value={<Money cents={d?.payableMonth} compact />} href="/financeiro/pagar" hint="Freelancers e despesas" />}
    </div>
  );
}
