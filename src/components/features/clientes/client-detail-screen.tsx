"use client";
/** Ficha do cliente (RF-M2-02): cabeçalho + abas na URL (?aba=). */
import Link from "next/link";
import { useState } from "react";
import { Button, ErrorState, PageBody, PageHeader, Skeleton, TabPanel, Tabs, type TabItem } from "@/components/ui";
import { ClientFormDialog } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useUrlState } from "@/lib/use-url-state";
import { ClientContactsTab } from "./client-contacts-tab";
import { ClientFinanceTab } from "./client-finance-tab";
import { ClientHeader } from "./client-header";
import { ClientOverviewTab } from "./client-overview-tab";
import { ClientProjectsTab } from "./client-projects-tab";
import { ClientProposalsTab } from "./client-proposals-tab";
import { useClient } from "./use-clients";

type Tab = "visao" | "projetos" | "contatos" | "propostas" | "financeiro";

export function ClientDetailScreen({ id }: { id: string }) {
  const perms = usePermissions();
  const q = useClient(id);
  const [editing, setEditing] = useState(false);
  const [{ aba }, set] = useUrlState<{ aba?: string }>({ aba: undefined });
  const c = q.data;
  const canWrite = perms.canWriteAll("clients");
  const canCreateProject = perms.canWriteAll("projects");
  const showFinance = perms.money && perms.canRead("receivables");

  const items: TabItem<Tab>[] = [
    { value: "visao", label: "Visão geral" },
    { value: "projetos", label: "Projetos", count: c?.projects.length },
    { value: "contatos", label: "Contatos", count: c?.contacts.length },
    { value: "propostas", label: "Propostas", count: c?.proposals.length, hidden: !perms.money },
    { value: "financeiro", label: "Financeiro", count: c?.receivables.length, hidden: !showFinance },
  ];
  const requested = (aba ?? "visao") as Tab;
  const tab = items.some((i) => i.value === requested && !i.hidden) ? requested : "visao";

  if (q.error)
    return (
      <>
        <PageHeader crumbs={[{ label: "Clientes", href: "/clientes", icon: "clients" }, { label: "Cliente" }]} />
        <PageBody>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </PageBody>
      </>
    );

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Clientes", href: "/clientes", icon: "clients" }, { label: c?.tradeName ?? "Carregando…" }]}
        actions={
          c && (
            <>
              {canWrite && (
                <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(true)}>
                  <span className="max-sm:hidden">Editar cliente</span>
                  <span className="sm:hidden">Editar</span>
                </Button>
              )}
              {canCreateProject && (
                <>
                  <Button asChild size="sm" variant="secondary" className="max-md:hidden">
                    <Link href={`/projetos/novo?origem=cotacao&cliente=${c.id}`}>Nova cotação</Link>
                  </Button>
                  <Button asChild size="sm" variant="primary">
                    <Link href={`/projetos/novo?cliente=${c.id}`}>Novo projeto</Link>
                  </Button>
                </>
              )}
            </>
          )
        }
      />
      <PageBody padded={false}>
        {!c ? (
          <div className="space-y-4 p-4 md:p-6">
            <Skeleton className="h-16" />
            <Skeleton className="h-10" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <ClientHeader client={c} />
            <Tabs value={tab} onChange={(v) => set({ aba: v === "visao" ? undefined : v })} items={items} listClassName="px-3 md:px-5">
              <TabPanel value="visao">
                <ClientOverviewTab client={c} />
              </TabPanel>
              <TabPanel value="projetos">
                <ClientProjectsTab client={c} canCreate={canCreateProject} />
              </TabPanel>
              <TabPanel value="contatos">
                <ClientContactsTab client={c} canWrite={canWrite} />
              </TabPanel>
              {perms.money && (
                <TabPanel value="propostas">
                  <ClientProposalsTab client={c} />
                </TabPanel>
              )}
              {showFinance && (
                <TabPanel value="financeiro">
                  <ClientFinanceTab client={c} />
                </TabPanel>
              )}
            </Tabs>
            <ClientFormDialog open={editing} onOpenChange={setEditing} client={c} />
          </>
        )}
      </PageBody>
    </>
  );
}
