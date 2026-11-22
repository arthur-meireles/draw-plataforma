"use client";
/** Início das pessoas internas: KPIs, minhas tarefas, entregas, atrasos, etapas e atividade. */
import { Section } from "@/components/ui";
import { EventTimeline, TaskPeek } from "@/components/domain";
import { InstallPromptCard } from "@/components/pwa/pwa-ui";
import { useApiQuery } from "@/data/hooks";
import { metricsApi } from "@/data/services";
import { useUrlState } from "@/lib/use-url-state";
import { CompactProjectList } from "./compact-project-list";
import { HomeGreeting } from "./home-greeting";
import { HomeStats } from "./home-stats";
import { ProjectsByStage } from "./projects-by-stage";
import { TodayTasks } from "./today-tasks";
import { UnreadPreview } from "./unread-preview";

export function InternalHome() {
  const [url, setUrl] = useUrlState({ tarefa: undefined as string | undefined });
  const q = useApiQuery(["metrics", "dashboard"], metricsApi.dashboard);
  return (
    <div className="space-y-4 md:space-y-6">
      <HomeGreeting />
      <InstallPromptCard />
      <HomeStats />
      <div className="grid gap-4 xl:grid-cols-3 md:gap-6">
        <div className="min-w-0 space-y-4 md:space-y-6 xl:col-span-2">
          <TodayTasks onOpen={(t) => setUrl({ tarefa: t.id })} />
          <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
            <CompactProjectList title="Entregas desta semana" icon="delivery" href="/projetos?prazo=semana" loading={q.isLoading} items={q.data?.dueThisWeek} emptyTitle="Nenhuma entrega nos próximos 7 dias" emptyDescription="Quando um projeto tiver prazo na semana, ele aparece aqui." />
            <CompactProjectList title="Atrasados" icon="warning" href="/projetos?prazo=atrasado" loading={q.isLoading} items={q.data?.overdueProjects} emptyTitle="Nenhum projeto atrasado" emptyDescription="Bom trabalho: todos os projetos ativos estão no prazo." />
          </div>
          <ProjectsByStage />
        </div>
        <div className="min-w-0 space-y-4 md:space-y-6">
          <UnreadPreview />
          <Section title="Atividade recente" icon="history" bodyClassName="max-h-[34rem] overflow-y-auto scrollbar-thin">
            <EventTimeline showProject limit={15} compact />
          </Section>
        </div>
      </div>
      <TaskPeek taskId={url.tarefa ?? null} onClose={() => setUrl({ tarefa: undefined })} />
    </div>
  );
}
