"use client";
import { Suspense, useState } from "react";
import { AccessGate } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Badge, Button, Callout, ConfirmDialog, CopyButton, DataTable, Fab, Icon, PageBody, PageHeader, RowActions, SearchInput, Toolbar, type Column } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { admApi } from "@/data/services";
import { relative } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { VaultFormDialog, type VaultRow } from "./vault-form-dialog";
import { VaultLogsSheet } from "./vault-logs-sheet";
import { VaultSecretCell } from "./vault-secret-cell";

type Row = Awaited<ReturnType<typeof admApi.vault>>[number];

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Content() {
  const p = usePermissions();
  const isAdmin = p.isAdmin;
  const [f, setF] = useUrlState({ q: "", log: undefined as string | undefined });
  const q = useApiQuery(["adm", "vault"], admApi.vault);
  const [form, setForm] = useState<{ item: VaultRow | null } | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const remove = useApiMutation(admApi.removeVaultItem, { success: "Item removido do cofre", onSuccess: () => setRemoving(null) });

  const term = f.q.trim().toLowerCase();
  const rows = q.data?.filter((r) => !term || `${r.title} ${r.username ?? ""} ${r.url ?? ""}`.toLowerCase().includes(term));
  const logItem = f.log && f.log !== "todos" ? q.data?.find((r) => r.id === f.log) : null;

  const columns: Column<Row>[] = [
    {
      id: "title",
      header: "Item",
      mobile: "title",
      sortValue: (r) => r.title,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{r.title}</p>
          {r.notes && <p className="max-w-64 truncate text-xs text-fg-subtle">{r.notes}</p>}
        </div>
      ),
    },
    {
      id: "url",
      header: "Endereço",
      hideBelow: "lg",
      cell: (r) =>
        r.url ? (
          <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-accent hover:underline">
            {host(r.url)}
            <Icon name="externalLink" size="xs" />
          </a>
        ) : (
          <span className="text-fg-placeholder">—</span>
        ),
    },
    {
      id: "user",
      header: "Usuário",
      mobile: "subtitle",
      cell: (r) =>
        r.username ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-fg-muted">{r.username}</span>
            <CopyButton value={r.username} label={`Copiar usuário de ${r.title}`} successMessage="Usuário copiado" size="xs" />
          </span>
        ) : (
          <span className="text-fg-placeholder">—</span>
        ),
    },
    { id: "secret", header: "Senha", cell: (r) => <VaultSecretCell id={r.id} title={r.title} /> },
    {
      id: "access",
      header: "Acesso",
      hideBelow: "xl",
      mobile: "hidden",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          {r.allowedRoles.map((role) => (
            <Badge key={role} size="xs">
              {ROLE_LABEL[role]}
            </Badge>
          ))}
        </div>
      ),
    },
    { id: "last", header: "Último acesso", hideBelow: "xl", mobile: "hidden", cell: (r) => <span className="text-xs text-fg-subtle">{r.lastAccess ? relative(r.lastAccess.at) : "Nunca"}</span> },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      width: "3rem",
      mobile: "trailing",
      cell: (r) => (
        <RowActions
          label={`Ações de ${r.title}`}
          items={[
            { label: "Ver acessos", icon: "history", onSelect: () => setF({ log: r.id }) },
            { label: "Editar", icon: "edit", hidden: !isAdmin, onSelect: () => setForm({ item: r }) },
            { label: "Remover…", icon: "delete", destructive: true, hidden: !isAdmin, separatorBefore: true, onSelect: () => setRemoving(r) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Administrativo", icon: "adm", href: "/adm/tarefas" }, { label: "Cofre" }]}
        count={q.data?.length}
        actions={
          <>
            {isAdmin && (
              <Button size="sm" variant="outline" icon="history" onClick={() => setF({ log: "todos" })} className="max-md:hidden">
                Log geral
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="primary" icon="add" onClick={() => setForm({ item: null })} className="max-md:hidden">
                Novo item
              </Button>
            )}
          </>
        }
      />
      <div className="shrink-0 border-b border-line p-3 md:px-4">
        <Callout tone="info" icon="shield" title="Cada revelação e cada cópia de senha ficam registradas">
          O log mostra quem acessou, qual item e quando. Senhas reveladas voltam a ficar ocultas em 20 segundos.
        </Callout>
      </div>
      <Toolbar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Buscar item…" />
      </Toolbar>
      <PageBody padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          empty={q.data?.length ? { icon: "search", title: "Nenhum item encontrado", description: "Tente outro termo de busca." } : { icon: "vault", title: "O cofre está vazio", description: isAdmin ? "Guarde acessos compartilhados da equipe com segurança e rastreio." : "Nenhum item foi liberado para o seu perfil. Peça acesso à administração.", action: isAdmin ? { label: "Novo item", icon: "add", onClick: () => setForm({ item: null }) } : undefined }}
        />
      </PageBody>
      {isAdmin && <Fab label="Novo item no cofre" onClick={() => setForm({ item: null })} />}
      <VaultFormDialog open={!!form} onOpenChange={(o) => !o && setForm(null)} item={form?.item ?? null} />
      <VaultLogsSheet open={!!f.log && (f.log === "todos" ? isAdmin : !!logItem)} onClose={() => setF({ log: undefined })} itemId={f.log === "todos" ? null : (logItem?.id ?? null)} itemTitle={logItem?.title} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remover do cofre?" description={`"${removing?.title}" deixa de aparecer para todos. O histórico de acessos é mantido.`} confirmLabel="Remover item" destructive loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} />
    </>
  );
}

export function VaultView() {
  return (
    <AccessGate resource="vault">
      <Suspense>
        <Content />
      </Suspense>
    </AccessGate>
  );
}
