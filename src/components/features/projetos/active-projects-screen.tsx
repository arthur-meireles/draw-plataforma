"use client";
import Link from "next/link";
import { Button, EmptyState, ErrorState, Fab, Icon, PageBody, PageHeader, ViewSwitcher } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { monthKey } from "@/components/domain";
import { ProjectAlertStrip } from "./project-alert-strip";
import { ProjectBoard } from "./project-board";
import { ProjectListView } from "./project-list-view";
import { ProjectToolbar } from "./project-toolbar";
import { ProjectCalendarView, ProjectGanttView } from "./project-timeline-views";
import { useActiveProjects, useProjectFilters } from "./use-project-filters";

/** Tela /projetos: projetos ativos em kanban, lista, calendário e Gantt (RF-M4-02, RF-M4-09, RF-M4-13). */
export function ActiveProjectsScreen() {
  const { canWriteAll } = usePermissions();
  const { state, set, view, setView, hasFilters, clear } = useProjectFilters();
  const { query, base, rows } = useActiveProjects(state);
  const canCreate = canWriteAll("projects");
  const empty = !query.isLoading && !query.error && rows?.length === 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Projetos", icon: "project", href: "/projetos" }, { label: "Ativos" }]}
        count={rows?.length}
        actions={
          <>
            <ViewSwitcher value={view} onChange={setView} views={["kanban", "lista", "calendario", "gantt"]} />
            {canCreate && (
              <Button asChild variant="primary" className="max-md:hidden">
                <Link href="/projetos/novo">
                  <Icon name="add" size="sm" />
                  Novo projeto
                </Link>
              </Button>
            )}
          </>
        }
      />
      <ProjectToolbar state={state} set={set} hasFilters={hasFilters} clear={clear} />
      <ProjectAlertStrip projects={base} active={state.prazo} onSelect={(prazo) => set({ prazo })} />
      <div className="flex min-h-0 flex-1 flex-col">
        {query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : empty ? (
          <EmptyState
            icon="project"
            title={hasFilters ? "Nenhum projeto com esses filtros" : "Nenhum projeto ativo ainda"}
            description={hasFilters ? "Ajuste ou limpe os filtros para ver outros projetos." : canCreate ? "Crie um projeto direto ou aprove uma cotação no Comercial." : "Quando você for alocado em um projeto, ele aparece aqui."}
            action={hasFilters ? { label: "Limpar filtros", onClick: clear } : canCreate ? { label: "Novo projeto", href: "/projetos/novo", icon: "add" } : undefined}
          />
        ) : view === "kanban" ? (
          <div className="min-h-0 flex-1">
            <ProjectBoard projects={rows} isLoading={query.isLoading} />
          </div>
        ) : view === "lista" ? (
          <PageBody padded={false}>
            <ProjectListView projects={rows} isLoading={query.isLoading} />
          </PageBody>
        ) : view === "calendario" ? (
          <PageBody padded={false}>
            <ProjectCalendarView projects={rows ?? []} month={state.mes || monthKey(new Date())} onMonthChange={(mes) => set({ mes })} />
          </PageBody>
        ) : (
          <ProjectGanttView projects={rows ?? []} />
        )}
      </div>
      {canCreate && <Fab label="Novo projeto" href="/projetos/novo" />}
    </>
  );
}
