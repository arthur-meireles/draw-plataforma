"use client";
/** Aba "Contatos": tabela com marcas de cobrança/decisor e CRUD (RF-M2-02). */
import { useState } from "react";
import { Badge, Button, DataTable, RowActions, type Column, Copyable } from "@/components/ui";
import type { ClientContact } from "@/data/types";
import { ContactFormDialog } from "./contact-form-dialog";
import type { ClientDetail } from "./use-clients";
import { RemoveContactDialog, useCanEditBilling } from "./client-billing";

export function ClientContactsTab({ client: c, canWrite }: { client: ClientDetail; canWrite: boolean }) {
  const [form, setForm] = useState<{ open: boolean; contact: ClientContact | null }>({ open: false, contact: null });
  const [toRemove, setToRemove] = useState<ClientContact | null>(null);
  // RN-49 — o Financeiro mantém só o contato de cobrança
  const { billing } = useCanEditBilling();
  const billingOnly = !canWrite && billing;
  const canEdit = (x: ClientContact) => canWrite || (billing && x.isBillingContact);
  const canAdd = canWrite || billing;

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
        canEdit(x) ? (
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
      {canAdd && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          <p className="text-xs text-fg-subtle">{billingOnly ? "Você mantém o contato que recebe as cobranças deste cliente." : "Quem recebe cobranças e quem decide a aprovação."}</p>
          <Button size="sm" variant="primary" icon="add" onClick={() => setForm({ open: true, contact: null })}>
            {billingOnly ? "Contato de cobrança" : "Adicionar contato"}
          </Button>
        </div>
      )}
      <DataTable
        rows={c.contacts}
        columns={columns}
        getRowId={(x) => x.id}
        onRowClick={(x) => canEdit(x) && setForm({ open: true, contact: x })}
        empty={{ icon: "user", title: "Nenhum contato cadastrado", description: "Cadastre o contato de cobrança e o decisor para agilizar propostas e faturamento.", action: canAdd ? { label: "Adicionar contato", icon: "add", onClick: () => setForm({ open: true, contact: null }) } : undefined }}
      />
      <ContactFormDialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} clientId={c.id} contact={form.contact} billingOnly={billingOnly} />
      <RemoveContactDialog client={c} contact={toRemove} onOpenChange={(o) => !o && setToRemove(null)} />
    </div>
  );
}
