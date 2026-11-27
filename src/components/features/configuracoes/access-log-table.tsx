"use client";
import { Badge, DataTable, type Column } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { usersApi } from "@/data/services";
import { dateTime } from "@/lib/format";

type Row = Awaited<ReturnType<typeof usersApi.accessLogs>>[number];

const ACTION: Record<Row["action"], { label: string; tone: "success" | "danger" | "neutral" | "warning" }> = {
  login: { label: "Entrou", tone: "success" },
  login_failed: { label: "Tentativa falha", tone: "danger" },
  mfa_failed: { label: "Código 2FA inválido", tone: "danger" },
  logout: { label: "Saiu", tone: "neutral" },
  secret_revealed: { label: "Revelou senha do cofre", tone: "warning" },
  sensitive_access: { label: "Acesso sensível", tone: "warning" },
  password_reset_requested: { label: "Pediu nova senha", tone: "neutral" },
  password_reset_done: { label: "Redefiniu a senha", tone: "warning" },
  invite_accepted: { label: "Aceitou o convite", tone: "success" },
  impersonate: { label: "Trocou de perfil (demonstração)", tone: "warning" },
  demo_reset: { label: "Restaurou dados de demonstração", tone: "warning" },
  invite_sent: { label: "Convite enviado", tone: "neutral" },
  invite_cancelled: { label: "Convite cancelado", tone: "warning" },
  role_changed: { label: "Perfil alterado", tone: "warning" },
  user_deactivated: { label: "Usuário inativado", tone: "warning" },
  user_reactivated: { label: "Usuário reativado", tone: "neutral" },
  password_changed: { label: "Trocou a senha", tone: "neutral" },
  profile_updated: { label: "Atualizou o perfil", tone: "neutral" },
  mfa_enabled: { label: "Ligou o 2FA", tone: "success" },
  mfa_disabled: { label: "Desligou o 2FA", tone: "warning" },
  mfa_recovery_used: { label: "Entrou com código de recuperação", tone: "warning" },
  mfa_recovery_regenerated: { label: "Gerou novos códigos de recuperação", tone: "neutral" },
  bank_data_changed: { label: "Alterou dados bancários", tone: "warning" },
};

/** Ações cujo detalhe ajuda na auditoria (e-mail tentado, item do cofre, perfil assumido). */
const SHOW_DETAIL = new Set<Row["action"]>(["login_failed", "secret_revealed", "password_reset_requested", "impersonate", "invite_sent", "invite_cancelled", "role_changed", "user_deactivated", "user_reactivated", "bank_data_changed", "profile_updated"]);

/** Log de acessos (login, falhas, leitura de segredos) — RNF-01. */
export function AccessLogTable() {
  const q = useApiQuery(["users", "access-logs"], usersApi.accessLogs);
  const columns: Column<Row>[] = [
    { id: "at", header: "Quando", mobile: "subtitle", sortValue: (l) => l.at, cell: (l) => <span className="whitespace-nowrap text-fg-muted">{dateTime(l.at)}</span> },
    { id: "user", header: "Usuário", mobile: "title", cell: (l) => <span className="font-medium text-fg">{l.userName}</span> },
    { id: "action", header: "Ação", mobile: "trailing", cell: (l) => <Badge tone={ACTION[l.action].tone}>{ACTION[l.action].label}</Badge> },
    { id: "detail", header: "Detalhe", hideBelow: "md", cell: (l) => <span className="text-fg-subtle">{SHOW_DETAIL.has(l.action) ? (l.detail ?? "—") : "—"}</span> },
  ];
  return (
    <DataTable
      rows={q.data}
      columns={columns}
      getRowId={(l) => l.id}
      isLoading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={{ icon: "history", title: "Nenhum acesso registrado ainda", description: "Logins, tentativas falhas, senhas, 2FA, convites, mudanças de perfil, inativações e leituras de segredos aparecem aqui assim que acontecerem." }}
    />
  );
}
