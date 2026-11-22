"use client";
/** Ficha do freelancer (RF-M2-04): cabeçalho + abas na URL. O freelancer só enxerga e edita o próprio registro. */
import { useState } from "react";
import { Button, ConfirmDialog, ErrorState, PageBody, PageHeader, Skeleton, TabPanel, Tabs, type Crumb, type TabItem } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { freelancersApi, freelancersExtraApi } from "@/data/services";
import { useUrlState } from "@/lib/use-url-state";
import { FreelancerDataTab } from "./freelancer-data-tab";
import { FreelancerDeliveriesTab } from "./freelancer-deliveries-tab";
import { FreelancerFormDialog } from "./freelancer-form-dialog";
import { FreelancerHeader } from "./freelancer-header";
import { FreelancerPaymentsTab } from "./freelancer-payments-tab";
import { FreelancerProjectsTab } from "./freelancer-projects-tab";
import { FreelancerTasksTab } from "./freelancer-tasks-tab";
import { useFreelancer } from "./use-freelancers";

type Tab = "projetos" | "tarefas" | "entregas" | "pagamentos" | "dados";

export function FreelancerDetailScreen({ id }: { id: string }) {
  const perms = usePermissions();
  const q = useFreelancer(id);
  const [editing, setEditing] = useState(false);
  const [inactivating, setInactivating] = useState(false);
  const [{ aba }, set] = useUrlState<{ aba?: string }>({ aba: undefined });
  const f = q.data;
  const own = perms.isFreelancer;
  const canManage = perms.canWriteAll("freelancers");
  const canInvite = perms.canWriteAll("users");
  const showMoney = perms.money || own;
  const showPayments = own || perms.canRead("payables");

  const invite = useApiMutation(() => freelancersApi.invite(id), { success: "Convite enviado. O freelancer receberá o link de acesso por e-mail." });
  const setStatus = useApiMutation((status: "ativo" | "inativo") => freelancersExtraApi.setStatus(id, status), {
    success: (r) => (r.status === "ativo" ? "Freelancer reativado" : "Freelancer inativado"),
    onSuccess: () => setInactivating(false),
  });

  const items: TabItem<Tab>[] = [
    { value: "projetos", label: "Projetos", count: f?.projects.length },
    { value: "tarefas", label: "Tarefas abertas", count: f?.openTasks.length },
    { value: "entregas", label: "Entregas", count: f?.deliveries.length },
    { value: "pagamentos", label: "Pagamentos", count: f?.payables.length, hidden: !showPayments },
    { value: "dados", label: "Dados" },
  ];
  const requested = (aba ?? "projetos") as Tab;
  const tab = items.some((i) => i.value === requested && !i.hidden) ? requested : "projetos";
  const crumbs: Crumb[] = own ? [{ label: "Meus dados e pagamentos", icon: "freelancer" }] : [{ label: "Freelancers", href: "/freelancers", icon: "freelancers" }, { label: f?.name ?? "Carregando…" }];

  if (q.error)
    return (
      <>
        <PageHeader crumbs={own ? crumbs : [{ label: "Freelancers", href: "/freelancers", icon: "freelancers" }, { label: "Freelancer" }]} />
        <PageBody>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </PageBody>
      </>
    );

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        actions={
          f && (
            <>
              {canInvite && !f.userId && f.status === "ativo" && (
                <Button size="sm" variant="secondary" icon="invite" loading={invite.isPending} onClick={() => invite.mutate(undefined)}>
                  <span className="max-sm:hidden">Convidar para a plataforma</span>
                  <span className="sm:hidden">Convidar</span>
                </Button>
              )}
              {canManage && (
                <Button size="sm" variant="ghost" icon={f.status === "ativo" ? "archive" : "unarchive"} loading={setStatus.isPending && !inactivating} onClick={() => (f.status === "ativo" ? setInactivating(true) : setStatus.mutate("ativo"))}>
                  <span className="max-sm:hidden">{f.status === "ativo" ? "Inativar…" : "Reativar"}</span>
                </Button>
              )}
              {(canManage || own) && (
                <Button size="sm" variant="primary" icon="edit" onClick={() => setEditing(true)}>
                  {own ? "Editar meus dados" : "Editar"}
                </Button>
              )}
            </>
          )
        }
      />
      <PageBody padded={false}>
        {!f ? (
          <div className="space-y-4 p-4 md:p-6">
            <Skeleton className="h-20" />
            <Skeleton className="h-10" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <>
            <FreelancerHeader freelancer={f} />
            <Tabs value={tab} onChange={(v) => set({ aba: v === "projetos" ? undefined : v })} items={items} listClassName="px-3 md:px-5">
              <TabPanel value="projetos">
                <FreelancerProjectsTab freelancer={f} showMoney={showMoney} />
              </TabPanel>
              <TabPanel value="tarefas">
                <FreelancerTasksTab freelancer={f} />
              </TabPanel>
              <TabPanel value="entregas">
                <FreelancerDeliveriesTab freelancer={f} />
              </TabPanel>
              {showPayments && (
                <TabPanel value="pagamentos">
                  <FreelancerPaymentsTab freelancer={f} showMoney={showMoney} />
                </TabPanel>
              )}
              <TabPanel value="dados">
                <FreelancerDataTab freelancer={f} />
              </TabPanel>
            </Tabs>
            <FreelancerFormDialog open={editing} onOpenChange={setEditing} freelancer={f} />
            <ConfirmDialog
              open={inactivating}
              onOpenChange={setInactivating}
              title="Inativar freelancer"
              description={`${f.name} deixa de aparecer nas alocações novas. O histórico de projetos e pagamentos é mantido.`}
              confirmLabel="Inativar freelancer"
              destructive
              loading={setStatus.isPending}
              onConfirm={() => setStatus.mutate("inativo")}
            />
          </>
        )}
      </PageBody>
    </>
  );
}
