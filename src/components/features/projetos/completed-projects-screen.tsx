"use client";
import { useMemo } from "react";
import { ClearFiltersButton, DataTable, FilterSelect, PageBody, PageHeader, SearchInput, Switch, Toolbar, type Column, type Option } from "@/components/ui";
import { Money, ProjectCode, ProjectStatusBadge, ProjectTypeIcon } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiQuery, useClientOptions, useProjectTypes } from "@/data/hooks";
import { projectsApi, type ProjectListItem } from "@/data/services";
import { dateFull, plural } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";

const DEFAULTS = { q: "", cliente: "", tipo: "", periodo: "", arquivados: "" };

const PERIOD_OPTIONS: Option[] = [
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "ano", label: "Este ano" },
  { value: "ano-passado", label: "Ano passado" },
];

const periodRange = (p: string): [number, number] | null => {
  const y = new Date().getFullYear();
  if (p === "30d") return [Date.now() - 30 * 86_400_000, Infinity];
  if (p === "90d") return [Date.now() - 90 * 86_400_000, Infinity];
  if (p === "ano") return [new Date(y, 0, 1).getTime(), Infinity];
  if (p === "ano-passado") return [new Date(y - 1, 0, 1).getTime(), new Date(y, 0, 1).getTime()];
  return null;
};

const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

/** Prazo vs realizado: "No prazo", "2 dias de atraso", "3 dias antes". */
function DeliveryCell({ p }: { p: ProjectListItem }) {
  if (!p.dueAt || !p.completedAt) return <span className="text-fg-subtle">{p.dueAt ? `Prazo ${dateFull(p.dueAt)}` : "Sem prazo"}</span>;
  const diff = dayDiff(p.dueAt, p.completedAt);
  const label = diff > 0 ? `${plural(diff, "dia", "dias")} de atraso` : diff < 0 ? `${plural(-diff, "dia", "dias")} antes` : "No prazo";
  return (
    <div className="leading-tight">
      <div className={diff > 0 ? "text-danger" : "text-success"}>{label}</div>
      <div className="text-2xs text-fg-subtle">Prazo {dateFull(p.dueAt)}</div>
    </div>
  );
}

/** Tela /projetos/concluidos: projetos concluídos e arquivados (RF-M4-02, RF-M4-09). */
export function CompletedProjectsScreen() {
  const [state, set] = useUrlState(DEFAULTS);
  const { money } = usePermissions();
  const clients = useClientOptions();
  const types = useProjectTypes();
  const includeArchived = state.arquivados === "1";
  const query = useApiQuery(["projects", "list", "done", includeArchived, state.q, state.cliente, state.tipo], () =>
    projectsApi.list({ status: includeArchived ? ["concluido", "arquivado"] : ["concluido"], q: state.q || undefined, clientId: state.cliente || undefined, projectTypeId: state.tipo || undefined }),
  );
  const rows = useMemo(() => {
    if (!query.data) return undefined;
    const range = periodRange(state.periodo);
    const list = [...query.data].sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    if (!range) return list;
    return list.filter((p) => {
      const t = p.completedAt ? new Date(p.completedAt).getTime() : 0;
      return t >= range[0] && t < range[1];
    });
  }, [query.data, state.periodo]);
  const hasFilters = !!(state.q || state.cliente || state.tipo || state.periodo);
  const clear = () => set({ q: "", cliente: "", tipo: "", periodo: "" });

  const clientOptions: Option[] = (clients.data ?? []).map((c) => ({ value: c.id, label: c.tradeName, description: c.legalName, keywords: [c.legalName] }));
  const typeOptions: Option[] = (types.data ?? []).map((t) => ({ value: t.id, label: t.name, description: `${t.codePrefix}-000` }));

  const columns: Column<ProjectListItem>[] = [
    { id: "code", header: "Código", cell: (p) => <ProjectCode code={p.code} />, sortValue: (p) => p.code, width: "7rem", mobile: "subtitle" },
    { id: "title", header: "Projeto", cell: (p) => <span className="font-medium text-fg">{p.title}</span>, sortValue: (p) => p.title, mobile: "title" },
    { id: "client", header: "Cliente", cell: (p) => p.clientName, sortValue: (p) => p.clientName },
    {
      id: "type",
      header: "Tipo",
      hideBelow: "lg",
      mobile: "hidden",
      cell: (p) => (
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <ProjectTypeIcon icon={p.typeIcon} size="xs" />
          {p.typeName}
        </span>
      ),
      sortValue: (p) => p.typeName,
    },
    { id: "completedAt", header: "Concluído em", cell: (p) => dateFull(p.completedAt), sortValue: (p) => p.completedAt },
    { id: "delivery", header: "Prazo vs realizado", hideBelow: "md", cell: (p) => <DeliveryCell p={p} />, sortValue: (p) => (p.dueAt && p.completedAt ? dayDiff(p.dueAt, p.completedAt) : null) },
    ...(money ? [{ id: "value", header: "Valor", align: "right" as const, hideBelow: "md" as const, cell: (p: ProjectListItem) => <Money cents={p.contractedAmountCents} />, sortValue: (p: ProjectListItem) => p.contractedAmountCents }] : []),
    { id: "status", header: "Status", cell: (p) => <ProjectStatusBadge status={p.status} />, mobile: "trailing" },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: "Projetos", icon: "project", href: "/projetos" }, { label: "Concluídos" }]} count={rows?.length} />
      <Toolbar>
        <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Buscar projeto, código ou cliente…" className="sm:w-72 max-md:w-56 max-md:shrink-0" />
        <FilterSelect label="Cliente" icon="client" options={clientOptions} value={state.cliente || null} onChange={(v) => set({ cliente: v ?? "" })} searchPlaceholder="Buscar cliente…" />
        <FilterSelect label="Tipo" icon="project" options={typeOptions} value={state.tipo || null} onChange={(v) => set({ tipo: v ?? "" })} />
        <FilterSelect label="Período" icon="due" options={PERIOD_OPTIONS} value={state.periodo || null} onChange={(v) => set({ periodo: v ?? "" })} />
        <ClearFiltersButton show={hasFilters} onClick={clear} />
        <span className="shrink-0 md:ml-auto">
          <Switch size="sm" checked={includeArchived} onCheckedChange={(v) => set({ arquivados: v ? "1" : "" })} label="Incluir arquivados" />
        </span>
      </Toolbar>
      <PageBody padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(p) => p.id}
          rowHref={(p) => `/projetos/${p.code}`}
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          initialSort={{ id: "completedAt", dir: "desc" }}
          empty={{
            icon: "project",
            title: hasFilters ? "Nenhum projeto concluído com esses filtros" : "Nenhum projeto concluído ainda",
            description: hasFilters ? "Ajuste ou limpe os filtros para ver outros projetos." : "Quando você concluir um projeto ativo, ele aparece aqui.",
            action: hasFilters ? { label: "Limpar filtros", onClick: clear } : { label: "Ver projetos ativos", href: "/projetos" },
          }}
        />
      </PageBody>
    </>
  );
}
