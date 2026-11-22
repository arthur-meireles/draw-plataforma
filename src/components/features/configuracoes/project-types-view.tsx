"use client";
import { Suspense } from "react";
import { AccessGate, ProjectCode, ProjectTypeIcon } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Badge, Button, Callout, DataTable, Fab, PageBody, PageHeader, type Column } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { projectTypesApi } from "@/data/services";
import { plural } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { ProjectTypeSheet, type ProjectTypeRow } from "./project-type-sheet";

function Content() {
  const p = usePermissions();
  const canEdit = p.canWriteAll("settings");
  const [f, setF] = useUrlState({ tipo: undefined as string | undefined });
  const q = useApiQuery(["project-types", "all"], () => projectTypesApi.list(true));
  const selected = f.tipo && f.tipo !== "novo" ? q.data?.find((t) => t.id === f.tipo) : null;
  const open = f.tipo === "novo" ? canEdit : !!selected;

  const columns: Column<ProjectTypeRow>[] = [
    {
      id: "name",
      header: "Tipo",
      mobile: "title",
      sortValue: (t) => t.name,
      cell: (t) => (
        <span className="flex items-center gap-2.5">
          <ProjectTypeIcon icon={t.icon} size="md" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{t.name}</span>
            {t.description && <span className="block max-w-sm truncate text-xs text-fg-subtle">{t.description}</span>}
          </span>
        </span>
      ),
    },
    { id: "prefix", header: "Prefixo", mobile: "subtitle", sortValue: (t) => t.codePrefix, cell: (t) => <ProjectCode code={`${t.codePrefix}-###`} /> },
    { id: "templates", header: "Tarefas-modelo", align: "right", hideBelow: "md", sortValue: (t) => t.templates.length, cell: (t) => <span className="text-fg-muted">{t.templates.length}</span> },
    { id: "projects", header: "Projetos", align: "right", hideBelow: "md", sortValue: (t) => t.projectsCount, cell: (t) => <span className="text-fg-muted">{t.projectsCount}</span> },
    { id: "status", header: "Status", mobile: "trailing", sortValue: (t) => Number(t.active), cell: (t) => <Badge tone={t.active ? "success" : "neutral"} dot>{t.active ? "Ativo" : "Inativo"}</Badge> },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: "Configurações", icon: "settings", href: "/configuracoes/usuarios" }, { label: "Tipos de projeto" }]} count={q.data?.length} actions={canEdit && <Button size="sm" variant="primary" icon="add" onClick={() => setF({ tipo: "novo" })} className="max-md:hidden">Novo tipo</Button>} />
      <div className="shrink-0 border-b border-line p-3 md:px-4">
        <Callout tone="info" title="O catálogo define o código e as tarefas iniciais dos projetos">
          {canEdit ? "Abra um tipo para ajustar prefixo, ícone e tarefas-modelo por etapa." : "Seu perfil consulta o catálogo. Alterações são feitas por administradores."}
          {q.data && ` ${plural(q.data.filter((t) => t.active).length, "tipo ativo", "tipos ativos")}.`}
        </Callout>
      </div>
      <PageBody padded={false}>
        <DataTable
          rows={q.data}
          columns={columns}
          getRowId={(t) => t.id}
          isLoading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          onRowClick={(t) => setF({ tipo: t.id })}
          empty={{ icon: "tag", title: "Nenhum tipo de projeto", description: "Crie o primeiro tipo para começar a abrir projetos.", action: canEdit ? { label: "Novo tipo", icon: "add", onClick: () => setF({ tipo: "novo" }) } : undefined }}
        />
      </PageBody>
      {canEdit && <Fab label="Novo tipo de projeto" onClick={() => setF({ tipo: "novo" })} />}
      <ProjectTypeSheet open={open} type={selected ?? null} readOnly={!canEdit} onClose={() => setF({ tipo: undefined })} />
    </>
  );
}

export function ProjectTypesView() {
  return (
    <AccessGate resource="settings">
      <Suspense>
        <Content />
      </Suspense>
    </AccessGate>
  );
}
