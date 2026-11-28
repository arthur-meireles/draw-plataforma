"use client";
/** Gerenciador de grupos econômicos: lista com quantidade de empresas e criação (RF-M2-01). */
import { useState } from "react";
import { Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Icon, IconButton, Skeleton, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { clientGroupsApi, clientsApi } from "@/data/services";
import { plural } from "@/lib/format";
import { useClientGroups } from "./use-clients";

export function ClientGroupsDialog({ open, onOpenChange, canEdit }: { open: boolean; onOpenChange: (o: boolean) => void; canEdit: boolean }) {
  const groups = useClientGroups();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  // RN-88 — renomear e excluir grupo vazio
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editError, setEditError] = useState<string>();
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const rename = useApiMutation((a: { id: string; name: string }) => clientGroupsApi.rename(a.id, a.name), {
    success: "Grupo renomeado",
    onSuccess: () => {
      setEditing(null);
      setEditError(undefined);
    },
    onError: (e) => setEditError(e.fieldErrors?.name ?? e.message),
  });
  const remove = useApiMutation((id: string) => clientGroupsApi.remove(id), { success: "Grupo excluído", onSuccess: () => setRemoving(null), onError: () => setRemoving(null) });
  const create = useApiMutation((n: string) => clientsApi.createGroup(n), {
    success: "Grupo criado",
    onSuccess: () => {
      setName("");
      setError(undefined);
    },
    onError: (e) => setError(e.fieldErrors?.name ?? e.message),
  });
  const submit = () => {
    if (!name.trim()) {
      setError("Dê um nome ao grupo");
      return;
    }
    create.mutate(name);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Grupos econômicos" description="Agrupe empresas do mesmo conglomerado para enxergar o relacionamento completo." size="md" footer={<Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>}>
      <div className="space-y-4">
        {canEdit && (
          <form
            noValidate
            className="flex items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <TextField aria-label="Nome do novo grupo" placeholder="Nome do novo grupo" containerClassName="flex-1" value={name} onChange={(e) => setName(e.target.value)} error={error} />
            <Button type="submit" variant="primary" icon="add" loading={create.isPending}>
              Criar grupo
            </Button>
          </form>
        )}
        {groups.error ? (
          <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
        ) : groups.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !groups.data?.length ? (
          <EmptyState compact icon="clients" title="Nenhum grupo criado" description="Crie o primeiro grupo e associe clientes a ele no cadastro." />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {groups.data.map((g) => (
              <li key={g.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                <Icon name="clients" size="sm" className="text-fg-subtle" />
                {editing?.id === g.id ? (
                  <form
                    noValidate
                    className="flex flex-1 items-start gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!editing.name.trim()) return setEditError("Dê um nome ao grupo");
                      rename.mutate(editing);
                    }}
                  >
                    <TextField aria-label="Novo nome do grupo" autoFocus containerClassName="flex-1" value={editing.name} onChange={(e) => setEditing({ id: g.id, name: e.target.value })} error={editError} />
                    <Button type="submit" size="sm" variant="primary" loading={rename.isPending}>
                      Salvar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 truncate font-medium text-fg">{g.name}</span>
                    <span className="text-xs text-fg-subtle">{plural(g.clients, "empresa", "empresas")}</span>
                    {canEdit && (
                      <>
                        <IconButton icon="edit" label={`Renomear ${g.name}`} size="sm" onClick={() => { setEditError(undefined); setEditing({ id: g.id, name: g.name }); }} />
                        <IconButton icon="delete" label={g.clients ? `${g.name} tem empresas e não pode ser excluído` : `Excluir ${g.name}`} size="sm" disabled={g.clients > 0} onClick={() => setRemoving({ id: g.id, name: g.name })} />
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Excluir grupo?"
        description={removing ? `O grupo "${removing.name}" não tem empresas e some da lista. Dá para criá-lo de novo quando precisar.` : undefined}
        confirmLabel="Excluir grupo"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Dialog>
  );
}
