"use client";
import { Suspense, useState } from "react";
import { AccessGate } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Button, ClearFiltersButton, ConfirmDialog, EmptyState, ErrorState, Fab, FilterSelect, PageBody, PageHeader, SearchInput, Skeleton, Toolbar } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { RESOURCE_CATEGORY_LABEL } from "@/data/reference";
import { admApi } from "@/data/services";
import type { Resource, ResourceCategory } from "@/data/types";
import { useUrlState } from "@/lib/use-url-state";
import { ResourceCard } from "./resource-card";
import { ResourceFormDialog, resourceCategoryOptions } from "./resource-form-dialog";

function Content() {
  const p = usePermissions();
  const canEdit = p.canWriteAll("adm");
  const [f, setF] = useUrlState({ q: "", categoria: "" });
  const q = useApiQuery(["adm", "resources"], admApi.resources);
  const [form, setForm] = useState<{ resource: Resource | null } | null>(null);
  const [removing, setRemoving] = useState<Resource | null>(null);
  const remove = useApiMutation(admApi.removeResource, { success: "Recurso excluído", onSuccess: () => setRemoving(null) });

  const term = f.q.trim().toLowerCase();
  const rows = q.data?.filter((r) => (!f.categoria || r.category === f.categoria) && (!term || `${r.title} ${r.description ?? ""}`.toLowerCase().includes(term)));
  const groups = (Object.keys(RESOURCE_CATEGORY_LABEL) as ResourceCategory[]).map((c) => ({ key: c, items: rows?.filter((r) => r.category === c) ?? [] })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader crumbs={[{ label: "Administrativo", icon: "adm", href: "/adm/tarefas" }, { label: "Recursos" }]} count={q.data?.length} actions={canEdit && <Button size="sm" variant="primary" icon="add" onClick={() => setForm({ resource: null })} className="max-md:hidden">Novo recurso</Button>} />
      <Toolbar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Buscar recurso…" />
        <FilterSelect label="Categoria" value={f.categoria} options={resourceCategoryOptions} onChange={(v) => setF({ categoria: v })} />
        <ClearFiltersButton show={!!(f.q || f.categoria)} onClick={() => setF({ q: "", categoria: "" })} />
      </Toolbar>
      <PageBody>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : !groups.length ? (
          q.data?.length ? (
            <EmptyState icon="search" title="Nenhum recurso encontrado" description="Ajuste a busca ou limpe os filtros." />
          ) : (
            <EmptyState icon="resource" title="A biblioteca está vazia" description="Reúna ferramentas, templates e playbooks para toda a equipe achar rápido." action={canEdit ? { label: "Novo recurso", icon: "add", onClick: () => setForm({ resource: null }) } : undefined} />
          )
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.key} aria-label={RESOURCE_CATEGORY_LABEL[g.key]}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                  {RESOURCE_CATEGORY_LABEL[g.key]}s<span className="text-xs font-normal tabular-nums text-fg-subtle">{g.items.length}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((r) => (
                    <ResourceCard key={r.id} resource={r} onEdit={canEdit ? () => setForm({ resource: r }) : undefined} onDelete={canEdit ? () => setRemoving(r) : undefined} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageBody>
      {canEdit && <Fab label="Novo recurso" onClick={() => setForm({ resource: null })} />}
      <ResourceFormDialog open={!!form} onOpenChange={(o) => !o && setForm(null)} resource={form?.resource ?? null} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Excluir recurso?" description={`"${removing?.title}" sai da biblioteca.`} confirmLabel="Excluir recurso" destructive loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} />
    </>
  );
}

export function ResourcesView() {
  return (
    <AccessGate resource="adm">
      <Suspense>
        <Content />
      </Suspense>
    </AccessGate>
  );
}
