"use client";
/** Início do freelancer (RF-M9-01..05): seus projetos, tarefas por prazo, NFs pendentes, agenda e materiais. */
import Link from "next/link";
import { Button, EmptyState, ErrorState, Section, Skeleton, Stat } from "@/components/ui";
import { ProjectCard, TaskList, TaskPeek } from "@/components/domain";
import { InstallPromptCard } from "@/components/pwa/pwa-ui";
import { useApiQuery } from "@/data/hooks";
import { metricsApi, projectsApi, tasksApi } from "@/data/services";
import { plural } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { HomeGreeting } from "./home-greeting";
import { PendingInvoices } from "./pending-invoices";
import { WeekAgenda } from "./week-agenda";

export function FreelancerHome() {
  const [url, setUrl] = useUrlState({ tarefa: undefined as string | undefined });
  const home = useApiQuery(["metrics", "freelancer-home"], metricsApi.freelancerHome);
  const projects = useApiQuery(["projects", "mine-active"], () => projectsApi.list({ status: ["ativo"] }));
  const tasks = useApiQuery(["tasks", "mine"], () => tasksApi.list({ assignee: "me" }));
  const open = tasks.data?.filter((t) => t.statusKey !== "concluida");
  const overdue = open?.filter((t) => t.isOverdue).length ?? 0;
  const pending = home.data?.pendingInvoices ?? [];

  return (
    <div className="space-y-4 md:space-y-6">
      <HomeGreeting />
      <InstallPromptCard />
      {home.error && <ErrorState error={home.error} onRetry={() => home.refetch()} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat loading={home.isLoading} icon="project" label="Projetos ativos" value={home.data?.projects} />
        <Stat loading={home.isLoading} icon="myTasks" label="Tarefas abertas" value={home.data?.openTasks} href="/minhas-tarefas" />
        <Stat loading={tasks.isLoading} icon="warning" tone={overdue ? "danger" : "success"} label="Atrasadas" value={overdue} href="/minhas-tarefas" hint={overdue ? "Atualize o status ou fale com a gestão" : "Tudo em dia"} />
        <Stat loading={home.isLoading} icon="invoice" tone={pending.length ? "warning" : "success"} label="NFs pendentes" value={pending.length} hint={plural(pending.length, "pedido", "pedidos")} />
      </div>

      {pending.length > 0 && <PendingInvoices items={pending} loading={home.isLoading} />}

      <WeekAgenda tasks={open ?? []} projects={projects.data ?? []} onOpenTask={(t) => setUrl({ tarefa: t.id })} />

      <div className="grid gap-4 md:gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 md:space-y-6 xl:col-span-2">
          <Section title="Suas tarefas" icon="myTasks" bodyClassName="p-0" actions={<Link href="/minhas-tarefas" className="text-xs text-accent hover:underline">Ver todas</Link>}>
            <TaskList tasks={open?.slice(0, 12)} isLoading={tasks.isLoading} error={tasks.error} onRetry={() => tasks.refetch()} groupBy="due" showProject onOpen={(t) => setUrl({ tarefa: t.id })} empty={{ icon: "success", title: "Nenhuma tarefa aberta", description: "Quando a gestão atribuir uma tarefa, ela aparece aqui." }} />
          </Section>
        </div>
        <div className="min-w-0 space-y-4 md:space-y-6">
          <Section title="Seus projetos" icon="project">
            {projects.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-24" />
              </div>
            ) : projects.error ? (
              <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
            ) : !projects.data?.length ? (
              <EmptyState compact icon="project" title="Sem projetos no momento" description="Você aparece aqui assim que for alocado em um projeto." />
            ) : (
              <div className="space-y-3">
                {projects.data.map((p) => (
                  <ProjectCard key={p.id} project={p} compact />
                ))}
              </div>
            )}
          </Section>
          <Section title="Materiais" icon="resource" description="Manuais de marca, referências e arquivos liberados para você.">
            <Button asChild variant="secondary" size="sm" icon="files">
              <Link href="/arquivos">Abrir materiais</Link>
            </Button>
          </Section>
        </div>
      </div>
      <TaskPeek taskId={url.tarefa ?? null} onClose={() => setUrl({ tarefa: undefined })} />
    </div>
  );
}
