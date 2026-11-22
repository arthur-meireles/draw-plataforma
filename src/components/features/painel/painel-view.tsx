"use client";
/**
 * Painel de indicadores (RF-M8-01..05, seção 12). Admin/gestão: tudo; comercial: aba Comercial;
 * financeiro: aba Financeiro; demais perfis: acesso restrito. Filtros e aba na URL.
 */
import { useMemo } from "react";
import { ErrorState, PageBody, PageHeader, Tabs, type TabItem } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useUrlState } from "@/lib/use-url-state";
import { BurndownTab } from "./burndown-tab";
import { CommercialTab } from "./commercial-tab";
import { FinanceTab } from "./finance-tab";
import { OperationTab } from "./operation-tab";
import { OverviewTab } from "./overview-tab";
import { PainelFilterBar } from "./painel-filters";
import { TeamTab } from "./team-tab";
import { periodDays, useIndicators, type PainelFilters } from "./use-indicators";

type TabKey = "geral" | "comercial" | "operacao" | "financeiro" | "equipe" | "burndown";

const ALL_TABS: (TabItem<TabKey> & { roles: string[] })[] = [
  { value: "geral", label: "Visão geral", icon: "dashboard", roles: ["admin", "gestao"] },
  { value: "comercial", label: "Comercial", icon: "commercial", roles: ["admin", "gestao", "comercial"] },
  { value: "operacao", label: "Operação", icon: "project", roles: ["admin", "gestao"] },
  { value: "financeiro", label: "Financeiro", icon: "finance", roles: ["admin", "gestao", "financeiro"] },
  { value: "equipe", label: "Equipe", icon: "team", roles: ["admin", "gestao"] },
  { value: "burndown", label: "Burndown", icon: "chart", roles: ["admin", "gestao"] },
];

export function PainelView() {
  const { role, money } = usePermissions();
  const [f, set] = useUrlState({ aba: undefined as string | undefined, periodo: "90", tipo: undefined as string | undefined, resp: undefined as string | undefined, projeto: undefined as string | undefined });

  const tabs = useMemo(() => ALL_TABS.filter((t) => t.roles.includes(role) && (t.value !== "financeiro" || money)), [role, money]);
  const tab = (tabs.find((t) => t.value === f.aba)?.value ?? tabs[0]?.value) as TabKey | undefined;
  const filters: PainelFilters = { periodo: f.periodo, tipo: f.tipo, resp: f.resp };
  // equipe e burndown têm consultas próprias
  const indicators = useIndicators(filters, !!tab && !["equipe", "burndown"].includes(tab));

  if (!tab)
    return (
      <>
        <PageHeader crumbs={[{ label: "Painel", icon: "dashboard" }]} />
        <PageBody>
          <ErrorState title="Acesso restrito" error={{ status: 403, message: "Seu perfil não tem acesso aos indicadores. Peça ao administrador se precisar deles." }} />
        </PageBody>
      </>
    );

  return (
    <>
      <PageHeader crumbs={[{ label: "Painel", icon: "dashboard" }]} />
      <Tabs<TabKey> value={tab} onChange={(v) => set({ aba: v === tabs[0].value ? undefined : v })} items={tabs} listClassName="bg-surface" />
      {tab !== "burndown" && <PainelFilterBar filters={filters} onChange={set} showOwner={tab !== "financeiro" && tab !== "equipe"} onlyPeriod={tab === "equipe"} />}
      <PageBody>
        {tab === "geral" && <OverviewTab q={indicators} />}
        {tab === "comercial" && <CommercialTab q={indicators} />}
        {tab === "operacao" && <OperationTab q={indicators} />}
        {tab === "financeiro" && <FinanceTab q={indicators} />}
        {tab === "equipe" && <TeamTab days={periodDays(f.periodo)} />}
        {tab === "burndown" && <BurndownTab projectId={f.projeto} onProjectChange={(id) => set({ projeto: id })} />}
      </PageBody>
    </>
  );
}
