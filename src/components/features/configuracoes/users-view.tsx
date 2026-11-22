"use client";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { AccessGate } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Avatar, Badge, Button, Callout, ClearFiltersButton, ConfirmDialog, DataTable, Fab, FilterSelect, Icon, PageBody, PageHeader, RowActions, SearchInput, Tabs, Toolbar, copyText, type Column } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { usersApi } from "@/data/services";
import type { Role, UserStatus } from "@/data/types";
import { relative } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { AccessLogTable } from "./access-log-table";
import { EditRoleDialog } from "./edit-role-dialog";
import { InviteUserDialog, inviteLink } from "./invite-user-dialog";
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
  const [f, setF] = useUrlState({ aba: "usuarios", q: "", perfil: "", status: "" });
  const aba = f.aba === "permissoes" || (f.aba === "acessos" && canEdit) ? f.aba : "usuarios";
  const users = useApiQuery(["users", "list"], () => usersApi.list());
  const [invite, setInvite] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [toggling, setToggling] = useState<Row | null>(null);

  const setStatus = useApiMutation((v: { id: string; status: "ativo" | "inativo" }) => usersApi.setStatus(v.id, v.status), {
    success: (_d) => (toggling?.status === "inativo" ? "Usuário reativado" : "Usuário inativado"),
    onSuccess: () => setToggling(null),
    onError: () => setToggling(null),
  });
  const resend = useApiMutation(usersApi.resendInvite, { success: "Convite reenviado por e-mail" });

  const term = f.q.trim().toLowerCase();
  const rows = users.data?.filter((u) => (!f.perfil || u.role === f.perfil) && (!f.status || u.status === f.status) && (!term || `${u.name} ${u.email}`.toLowerCase().includes(term)));

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
              { label: "Copiar link do convite", icon: "link", hidden: u.status !== "convidado", onSelect: async () => ((await copyText(inviteLink(u.inviteToken!))) ? toast.success("Link do convite copiado") : toast.error("Não foi possível copiar o link.")) },
              { label: "Reenviar convite", icon: "send", hidden: u.status !== "convidado", onSelect: () => resend.mutate(u.id) },
              { label: "Inativar…", icon: "lock", destructive: true, separatorBefore: true, hidden: u.status === "inativo" || u.status === "convidado" || u.id === p.user.id, onSelect: () => setToggling(u) },
              { label: "Reativar…", icon: "restore", hidden: u.status !== "inativo", separatorBefore: true, onSelect: () => setToggling(u) },
            ]}
          />
        ) : null,
    },
  ];

  const inactivating = toggling?.status !== "inativo";
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
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Buscar por nome ou e-mail…" />
          <FilterSelect label="Perfil" value={f.perfil} options={INVITABLE_ROLES.map((r) => ({ value: r as Role, label: ROLE_LABEL[r] }))} onChange={(v) => setF({ perfil: v })} />
          <FilterSelect label="Status" value={f.status} options={(Object.keys(STATUS) as UserStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))} onChange={(v) => setF({ status: v })} />
          <ClearFiltersButton show={!!(f.q || f.perfil || f.status)} onClick={() => setF({ q: "", perfil: "", status: "" })} />
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
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={inactivating ? `Inativar ${toggling?.name ?? ""}?` : `Reativar ${toggling?.name ?? ""}?`}
        description={inactivating ? "A pessoa perde o acesso na hora. O histórico dela é mantido e você pode reativá-la depois." : "A pessoa volta a entrar com o mesmo perfil de antes."}
        confirmLabel={inactivating ? "Inativar usuário" : "Reativar usuário"}
        destructive={inactivating}
        loading={setStatus.isPending}
        onConfirm={() => toggling && setStatus.mutate({ id: toggling.id, status: inactivating ? "inativo" : "ativo" })}
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
