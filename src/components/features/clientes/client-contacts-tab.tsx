"use client";
/** Aba "Contatos": tabela com marcas de cobrança/decisor e CRUD (RF-M2-02). */
import { useState } from "react";
import { Badge, Button, ConfirmDialog, DataTable, RowActions, type Column, Copyable } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { clientsApi } from "@/data/services";
import type { ClientContact } from "@/data/types";
import { ContactFormDialog } from "./contact-form-dialog";
import type { ClientDetail } from "./use-clients";

export function ClientContactsTab({ client: c, canWrite }: { client: ClientDetail; canWrite: boolean }) {
  const [form, setForm] = useState<{ open: boolean; contact: ClientContact | null }>({ open: false, contact: null });
  const [toRemove, setToRemove] = useState<ClientContact | null>(null);
  const remove = useApiMutation((id: string) => clientsApi.removeContact(id), { success: "Contato removido", onSuccess: () => setToRemove(null) });

  const columns: Column<ClientContact>[] = [
    {
      id: "name",
      header: "Contato",
      mobile: "title",
      sortValue: (x) => x.name,
      cell: (x) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-fg">{x.name}</span>
          {x.jobTitle && <span className="block truncate text-xs text-fg-subtle">{x.jobTitle}</span>}
        </span>
      ),
    },
    { id: "email", header: "E-mail", mobile: "subtitle", cell: (x) => <Copyable value={x.email} label="E-mail"><a href={`mailto:${x.email}`} onClick={(e) => e.stopPropagation()} className="text-accent hover:underline">{x.email}</a></Copyable> },
    { id: "phone", header: "Telefone", hideBelow: "md", mobile: "meta", cell: (x) => <span className="text-fg-muted"><Copyable value={x.phone} label="Telefone" /></span> },
    {
      id: "flags",
      header: "Papéis",
      mobile: "meta",
      cell: (x) => (
        <span className="flex flex-wrap gap-1">
          {x.isBillingContact && <Badge tone="info" icon="invoice">Cobrança</Badge>}
          {x.isDecisionMaker && <Badge tone="violet" icon="approval">Decisor</Badge>}
          {!x.isBillingContact && !x.isDecisionMaker && <span className="text-fg-placeholder">—</span>}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      width: "2.5rem",
      mobile: "hidden",
      cell: (x) =>
        canWrite ? (
          <RowActions
            items={[
              { label: "Editar contato", icon: "edit", onSelect: () => setForm({ open: true, contact: x }) },
              { label: "Remover contato…", icon: "delete", destructive: true, onSelect: () => setToRemove(x) },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div>
      {canWrite && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          <p className="text-xs text-fg-subtle">Quem recebe cobranças e quem decide a aprovação.</p>
          <Button size="sm" variant="primary" icon="add" onClick={() => setForm({ open: true, contact: null })}>
            Adicionar contato
          </Button>
        </div>
      )}
      <DataTable
        rows={c.contacts}
        columns={columns}
        getRowId={(x) => x.id}
        onRowClick={canWrite ? (x) => setForm({ open: true, contact: x }) : undefined}
        empty={{ icon: "user", title: "Nenhum contato cadastrado", description: "Cadastre o contato de cobrança e o decisor para agilizar propostas e faturamento.", action: canWrite ? { label: "Adicionar contato", icon: "add", onClick: () => setForm({ open: true, contact: null }) } : undefined }}
      />
      <ContactFormDialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} clientId={c.id} contact={form.contact} />
      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remover contato"
        description={toRemove ? `${toRemove.name} deixará de aparecer na ficha do cliente.` : undefined}
        confirmLabel="Remover contato"
        destructive
        loading={remove.isPending}
        onConfirm={() => toRemove && remove.mutate(toRemove.id)}
      />
    </div>
  );
}
