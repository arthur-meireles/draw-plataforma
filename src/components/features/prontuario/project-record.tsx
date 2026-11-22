"use client";
import { Card, ErrorState, Fab, PageBody, PageHeader, Skeleton, TabPanel, Tabs, type TabItem } from "@/components/ui";
import { CommentThread, EventTimeline, FileManager } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useUrlState } from "@/lib/use-url-state";
import { ProjectActions } from "./project-actions";
import { ProjectApprovals } from "./project-approvals";
import { ProjectEmails } from "./project-emails";
import { ProjectFinance } from "./project-finance";
import { ProjectHeader } from "./project-header";
import { ProjectOverview } from "./project-overview";
import { PausedBanner } from "./paused-banner";
import { ProjectProperties } from "./project-properties";
import { ProjectTasks } from "./project-tasks";
import { ProjectTeam } from "./project-team";
import { useProject, useProjectMembers, type ProjectDetail } from "./use-project";

const TABS = ["visao-geral", "tarefas", "equipe", "arquivos", "comentarios", "aprovacoes", "financeiro", "emails", "historico"] as const;
type Tab = (typeof TABS)[number];

function RecordSkeleton() {
  return (
    <div aria-busy className="space-y-4 p-4 md:p-6">
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <Skeleton className="h-10" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-80 max-xl:hidden" />
      </div>
    </div>
  );
}

function Tabbed({ project }: { project: ProjectDetail }) {
  const { money, isFreelancer, canRead } = usePermissions();
  const [url, setUrl] = useUrlState({ aba: "visao-geral", proposta: undefined as string | undefined });
  const members = useProjectMembers(project.id);

  const showFinance = money;
  const showEmails = !isFreelancer && canRead("mail");
  const tab: Tab = (TABS as readonly string[]).includes(url.aba) && !(url.aba === "financeiro" && !showFinance) && !(url.aba === "emails" && !showEmails) ? (url.aba as Tab) : "visao-geral";
  const items: TabItem<Tab>[] = [
    { value: "visao-geral", label: "Visão geral" },
    { value: "tarefas", label: "Tarefas", count: project.subtasksTotal || undefined },
    { value: "equipe", label: "Equipe", count: members.data?.filter((m) => m.active).length },
    { value: "arquivos", label: "Arquivos" },
    { value: "comentarios", label: "Comentários" },
    { value: "aprovacoes", label: "Aprovações" },
    { value: "financeiro", label: "Financeiro", hidden: !showFinance },
    { value: "emails", label: "E-mails", hidden: !showEmails },
    { value: "historico", label: "Histórico" },
  ];
  const setTab = (aba: string) => setUrl({ aba, proposta: undefined, tarefa: undefined, arquivo: undefined, q: undefined, cat: undefined, vista: undefined, filtro: undefined } as never);

  return (
    <Tabs value={tab} onChange={setTab} items={items} listClassName="px-0">
      <TabPanel value={tab} className="pt-4 outline-none">
        {tab === "visao-geral" && <ProjectOverview project={project} onTab={setTab} proposalOpen={url.proposta === "nova"} onProposalOpen={(open) => setUrl({ proposta: open ? "nova" : undefined })} />}
        {tab === "tarefas" && <Card className="overflow-hidden"><ProjectTasks project={project} /></Card>}
        {tab === "equipe" && <Card className="overflow-hidden"><ProjectTeam project={project} /></Card>}
        {tab === "arquivos" && (
          <Card className="overflow-hidden">
            <FileManager projectId={project.id} />
          </Card>
        )}
        {tab === "comentarios" && (
          <Card className="p-4">
            <CommentThread projectId={project.id} />
          </Card>
        )}
        {tab === "aprovacoes" && <Card className="overflow-hidden"><ProjectApprovals project={project} /></Card>}
        {tab === "financeiro" && showFinance && <ProjectFinance project={project} />}
        {tab === "emails" && showEmails && <Card className="overflow-hidden"><ProjectEmails project={project} /></Card>}
        {tab === "historico" && (
          <Card className="p-4">
            <EventTimeline projectId={project.id} />
          </Card>
        )}
      </TabPanel>
    </Tabs>
  );
}

/** Prontuário do projeto: cabeçalho, abas na URL e coluna de propriedades (RF-M4-04). */
export function ProjectRecord({ code }: { code: string }) {
  const { canWriteAll, money } = usePermissions();
  const q = useProject(code);
  const [, setUrl] = useUrlState({ aba: "visao-geral", proposta: undefined as string | undefined });
  const project = q.data;
  const newProposal = () => setUrl({ aba: "visao-geral", proposta: "nova" });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Projetos", href: "/projetos", icon: "projects" }, { label: project?.code ?? code }]}
        actions={project && <ProjectActions project={project} onNewProposal={newProposal} />}
      />
      <PageBody padded={false}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-24" />
        ) : !project ? (
          <RecordSkeleton />
        ) : (
          <>
            <ProjectHeader project={project} />
            <PausedBanner project={project} />
            <div className="grid grid-cols-1 gap-4 px-4 pb-8 md:px-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6">
              <aside className="xl:col-start-2 xl:row-start-1" aria-label="Propriedades do projeto">
                <ProjectProperties project={project} className="xl:sticky xl:top-4" />
              </aside>
              <div className="min-w-0 xl:col-start-1 xl:row-start-1">
                <Tabbed project={project} />
              </div>
            </div>
            {project.status === "cotacao" && canWriteAll("commercial") && money && <Fab label="Nova proposta" icon="add" onClick={newProposal} />}
          </>
        )}
      </PageBody>
    </>
  );
}
