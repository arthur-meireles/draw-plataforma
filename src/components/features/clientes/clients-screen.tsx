"use client";
/** Listagem de clientes (RF-M2-01). */
import { useState } from "react";
import { Button, ConfirmDialog, Fab, PageBody, PageHeader } from "@/components/ui";
import { ClientFormDialog } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { clientsApi } from "@/data/services";
import type { Client } from "@/data/types";
import { ClientFiltersBar } from "./client-filters";
import { ClientGroupsDialog } from "./client-groups-dialog";
import { ClientTable } from "./client-table";
import { useClientFilters, useClients, type ClientRow } from "./use-clients";

export function ClientsScreen() {
  const perms = usePermissions();
  const filters = useClientFilters();
  const q = useClients(filters.filters);
  const [form, setForm] = useState<{ open: boolean; client: Client | null }>({ open: false, client: null });
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ClientRow | null>(null);
  const canWrite = perms.canWriteAll("clients");
  const canCreateProject = perms.canWriteAll("projects");

  const remove = useApiMutation((id: string) => clientsApi.remove(id), {
    success: "Cliente excluído",
    onSuccess: () => setToDelete(null),
    onError: () => setToDelete(null),
  });

  const openCreate = () => setForm({ open: true, client: null });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Clientes", icon: "clients" }]}
        count={q.data?.length}
        actions={
          <>
            <Button variant="ghost" size="sm" icon="clients" onClick={() => setGroupsOpen(true)}>
              Grupos
            </Button>
            {canWrite && (
              <Button variant="primary" size="sm" icon="add" onClick={openCreate} className="max-md:hidden">
                Novo cliente
              </Button>
            )}
          </>
        }
      />
      <ClientFiltersBar filters={filters} />
      <PageBody padded={false}>
        <ClientTable
          rows={q.data}
          isLoading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          hasFilters={filters.filterCount > 0}
          onClear={filters.clear}
          onCreate={openCreate}
          canWrite={canWrite}
          canCreateProject={canCreateProject}
          onEdit={(c) => setForm({ open: true, client: c })}
          onDelete={setToDelete}
        />
      </PageBody>
      {canWrite && <Fab label="Novo cliente" onClick={openCreate} />}

      <ClientFormDialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} client={form.client} />
      <ClientGroupsDialog open={groupsOpen} onOpenChange={setGroupsOpen} canEdit={canWrite} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir cliente"
        description={toDelete ? `${toDelete.tradeName} será removido do cadastro. Clientes com projetos não podem ser excluídos — inative-os.` : undefined}
        confirmLabel="Excluir cliente"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}
