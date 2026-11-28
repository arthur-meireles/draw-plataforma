"use client";
import { Suspense, useState } from "react";
import { AccessGate } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Avatar, Badge, Button, Callout, ClearFiltersButton, ConfirmDialog, DataTable, Dialog, Fab, FilterSelect, Icon, PageBody, PageHeader, RowActions, SearchInput, Tabs, Toolbar, type Column } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { usersApi, usersExtraApi } from "@/data/services";
import type { Role, UserStatus } from "@/data/types";
import { relative } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { AccessLogTable } from "./access-log-table";
import { DeactivateUserDialog } from "./deactivate-user-dialog";
import { EditRoleDialog } from "./edit-role-dialog";
import { InviteLinkBox, InviteUserDialog } from "./invite-user-dialog";
import { PermissionMatrix } from "./permission-matrix";
import { INVITABLE_ROLES } from "./roles";

type Row = Awaited<ReturnType<typeof usersApi.list>>[number];

const STATUS: Record<UserStatus, { label: string; tone: "success" | "info" | "neutral" }> = {
  ativo: { label: "Ativo", tone: "success" },
  convidado: { label: "Convite pendente", tone: "info" },
  inativo: { label: "Inativo", tone: "neutral" },
};

function Content() {
  const p = usePermissions();
  const canEdit = p.canWriteAll("users");
  const [f, setF] = useUrlState({ aba: "usuarios", q: "", perfil: "", status: "", tipo: "" });
  const aba = f.aba === "permissoes" || (f.aba === "acessos" && canEdit) ? f.aba : "usuarios";
  const users = useApiQuery(["users", "list"], () => usersApi.list());
  const [invite, setInvite] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  /** RN-36: inativar abre o diálogo de pendências/reatribuição; reativar é confirmação simples. */
  const [deactivating, setDeactivating] = useState<Row | null>(null);
  const [reactivating, setReactivating] = useState<Row | null>(null);
  const [cancelling, setCancelling] = useState<Row | null>(null);

  const reactivate = useApiMutation((id: string) => usersExtraApi.reactivate(id), {
    success: "Usuário reativado",
    onSuccess: () => setReactivating(null),
    onError: () => setReactivating(null),
  });
  const cancelInvite = useApiMutation((id: string) => usersExtraApi.cancelInvite(id), {
    success: "Convite cancelado. O link deixou de valer.",
    onSuccess: () => setCancelling(null),
    onError: () => setCancelling(null),
  });
  const resend = useApiMutation(usersApi.resendInvite, { success: "Convite reenviado por e-mail. O link anterior deixou de valer." });
  /** RN-32: o link só existe na hora em que é gerado (o banco guarda o hash). */
  const [link, setLink] = useState<{ name: string; token: string } | null>(null);
  const genLink = useApiMutation((u: Row) => usersApi.inviteLink(u.id).then((r) => ({ ...r, name: u.name })), {
    success: false,
    onSuccess: (r) => setLink({ name: r.name, token: r.inviteToken }),
  });

  const term = f.q.trim().toLowerCase();
  const rows = users.data?.filter((u) => (!f.perfil || u.role === f.perfil) && (!f.status || u.status === f.status) && (!f.tipo || u.userType === f.tipo) && (!term || `${u.name} ${u.email}`.toLowerCase().includes(term)));

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Nome",
      mobile: "title",
      sortValue: (u) => u.name,
      cell: (u) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={u.name} color={u.avatarColor} size="lg" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">
              {u.name}
              {u.id === p.user.id && <span className="ml-1.5 text-xs font-normal text-fg-subtle">(você)</span>}
            </span>
            {u.jobTitle && <span className="block truncate text-xs text-fg-subtle">{u.jobTitle}</span>}
          </span>
        </span>
      ),
    },
    { id: "email", header: "E-mail", mobile: "subtitle", hideBelow: "md", sortValue: (u) => u.email, cell: (u) => <span className="text-fg-muted">{u.email}</span> },
    { id: "role", header: "Perfil", sortValue: (u) => ROLE_LABEL[u.role], cell: (u) => <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{ROLE_LABEL[u.role]}</Badge> },
    { id: "status", header: "Status", mobile: "trailing", sortValue: (u) => u.status, cell: (u) => <Badge tone={STATUS[u.status].tone} dot>{STATUS[u.status].label}</Badge> },
    { id: "last", header: "Último acesso", hideBelow: "lg", sortValue: (u) => u.lastLoginAt, cell: (u) => <span className="text-fg-subtle">{u.lastLoginAt ? relative(u.lastLoginAt) : "Nunca"}</span> },
    {
      id: "mfa",
      header: "2FA",
      hideBelow: "lg",
      mobile: "hidden",
      align: "center",
      cell: (u) => (u.mfaEnabled ? <span className="inline-flex items-center gap-1 text-success"><Icon name="shield" size="sm" label="2FA ativo" /></span> : <span className="text-fg-placeholder" aria-label="2FA desligado">—</span>),
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      width: "3rem",
      cell: (u) =>
        canEdit ? (
          <RowActions
            label={`Ações de ${u.name}`}
            items={[
              { label: "Alterar perfil", icon: "user", onSelect: () => setEditing(u), hidden: u.status === "inativo" },
              { label: "Gerar link do convite…", icon: "link", hidden: u.status !== "convidado", onSelect: () => genLink.mutate(u) },
              { label: "Reenviar convite", icon: "send", hidden: u.status !== "convidado", onSelect: () => resend.mutate(u.id) },
              { label: "Cancelar convite…", icon: "close", destructive: true, separatorBefore: true, hidden: u.status !== "convidado", onSelect: () => setCancelling(u) },
              { label: "Inativar…", icon: "lock", destructive: true, separatorBefore: true, hidden: u.status === "inativo" || u.status === "convidado" || u.id === p.user.id, onSelect: () => setDeactivating(u) },
              { label: "Reativar…", icon: "restore", hidden: u.status !== "inativo", separatorBefore: true, onSelect: () => setReactivating(u) },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: "Configurações", icon: "settings", href: "/configuracoes/usuarios" }, { label: "Usuários" }]} count={users.data?.length} actions={canEdit && <Button size="sm" variant="primary" icon="invite" onClick={() => setInvite(true)} className="max-md:hidden">Convidar usuário</Button>} />
      <Tabs
        value={aba}
        onChange={(v) => setF({ aba: v })}
        items={[
          { value: "usuarios", label: "Usuários", icon: "team", count: users.data?.length },
          { value: "permissoes", label: "Matriz de permissões", icon: "shield" },
          { value: "acessos", label: "Log de acessos", icon: "history", hidden: !canEdit },
        ]}
      />
      {!canEdit && (
        <div className="shrink-0 border-b border-line p-3 md:px-4">
          <Callout tone="neutral" icon="lock" title="Somente leitura">Seu perfil consulta usuários e permissões. Convites e alterações são feitos por administradores.</Callout>
        </div>
      )}
      {aba === "usuarios" && (
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Buscar por nome ou e-mail…" className="max-md:w-52 max-md:shrink-0" />
          <FilterSelect label="Perfil" value={f.perfil || null} options={INVITABLE_ROLES.map((r) => ({ value: r as Role, label: ROLE_LABEL[r] }))} onChange={(v) => setF({ perfil: v ?? "" })} />
          <FilterSelect label="Status" value={f.status || null} options={(Object.keys(STATUS) as UserStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))} onChange={(v) => setF({ status: v ?? "" })} />
          <FilterSelect label="Tipo" value={f.tipo || null} options={[{ value: "internal", label: "Equipe interna" }, { value: "freelancer", label: "Freelancers" }]} onChange={(v) => setF({ tipo: v ?? "" })} />
          <ClearFiltersButton show={!!(f.q || f.perfil || f.status || f.tipo)} onClick={() => setF({ q: "", perfil: "", status: "", tipo: "" })} />
        </Toolbar>
      )}
      <PageBody padded={false}>
        {aba === "usuarios" && (
          <DataTable
            rows={rows}
            columns={columns}
            getRowId={(u) => u.id}
            isLoading={users.isLoading}
            error={users.error}
            onRetry={() => users.refetch()}
            onRowClick={canEdit ? (u) => u.status !== "inativo" && setEditing(u) : undefined}
            empty={users.data?.length ? { icon: "search", title: "Nenhum usuário encontrado", description: "Ajuste a busca ou limpe os filtros." } : { icon: "team", title: "Nenhum usuário", description: "Convide a primeira pessoa da equipe.", action: canEdit ? { label: "Convidar usuário", icon: "invite", onClick: () => setInvite(true) } : undefined }}
          />
        )}
        {aba === "permissoes" && <PermissionMatrix />}
        {aba === "acessos" && canEdit && <AccessLogTable />}
      </PageBody>
      {canEdit && aba === "usuarios" && <Fab label="Convidar usuário" icon="invite" onClick={() => setInvite(true)} />}
      <InviteUserDialog open={invite} onOpenChange={setInvite} />
      <EditRoleDialog user={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={!!link}
        onOpenChange={(o) => !o && setLink(null)}
        title="Link do convite"
        description={link ? `Envie para ${link.name}. Quem recebe define a senha ao aceitar.` : undefined}
        footer={<Button variant="primary" onClick={() => setLink(null)}>Concluir</Button>}
      >
        {link && (
          <div className="space-y-3">
            <InviteLinkBox token={link.token} />
            <Callout tone="info">Este link vale por 7 dias e só pode ser usado uma vez. O link enviado antes deixou de valer.</Callout>
          </div>
        )}
      </Dialog>
      <DeactivateUserDialog user={deactivating} onClose={() => setDeactivating(null)} />
      <ConfirmDialog
        open={!!reactivating}
        onOpenChange={(o) => !o && setReactivating(null)}
        title={`Reativar ${reactivating?.name ?? ""}?`}
        description="A pessoa volta a entrar com o mesmo perfil de antes. Projetos e tarefas reatribuídos na inativação continuam com quem assumiu."
        confirmLabel="Reativar usuário"
        loading={reactivate.isPending}
        onConfirm={() => reactivating && reactivate.mutate(reactivating.id)}
      />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={`Cancelar o convite de ${cancelling?.name ?? ""}?`}
        description="O link enviado deixa de funcionar na hora e a pessoa sai da lista. Você pode convidar o mesmo e-mail de novo depois."
        confirmLabel="Cancelar convite"
        destructive
        loading={cancelInvite.isPending}
        onConfirm={() => cancelling && cancelInvite.mutate(cancelling.id)}
      />
    </>
  );
}

export function UsersView() {
  return (
    <AccessGate resource="users">
      <Suspense>
        <Content />
      </Suspense>
    </AccessGate>
  );
}
