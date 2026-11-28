"use client";
import { toast } from "sonner";
import { Badge, Button, ClearFiltersButton, DataTable, FilterSelect, Toolbar, type Column } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { usersApi } from "@/data/services";
import { downloadCsv } from "@/lib/csv";
import { dateTime } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";

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
  login_blocked: { label: "Conta bloqueada por tentativas", tone: "danger" },
  sessions_revoked: { label: "Encerrou outras sessões", tone: "neutral" },
};

/** Ações cujo detalhe ajuda na auditoria (e-mail tentado, item do cofre, perfil assumido). */
const SHOW_DETAIL = new Set<Row["action"]>(["login_failed", "secret_revealed", "password_reset_requested", "impersonate", "invite_sent", "invite_cancelled", "role_changed", "user_deactivated", "user_reactivated", "bank_data_changed", "profile_updated"]);

const PERIODS = [
  { value: "1", label: "Últimas 24 horas" },
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
];

/** Log de acessos e trilha de segurança — filtros por pessoa, ação e período; paginado; exporta CSV (RNF-01, RN-76). */
export function AccessLogTable() {
  const [f, setF] = useUrlState({ pessoa: "", acao: "", periodo: "" });
  const q = useApiQuery(["users", "access-logs", f.pessoa, f.acao, f.periodo], () => usersApi.accessLogs({ userId: f.pessoa || undefined, action: (f.acao || undefined) as Row["action"] | undefined, days: f.periodo ? Number(f.periodo) : undefined }));
  const people = useApiQuery(["users", "list"], () => usersApi.list());
  const columns: Column<Row>[] = [
    { id: "at", header: "Quando", mobile: "subtitle", sortValue: (l) => l.at, cell: (l) => <span className="whitespace-nowrap text-fg-muted">{dateTime(l.at)}</span> },
    { id: "user", header: "Usuário", mobile: "title", cell: (l) => <span className="font-medium text-fg">{l.userName}</span> },
    { id: "action", header: "Ação", mobile: "trailing", cell: (l) => <Badge tone={ACTION[l.action].tone}>{ACTION[l.action].label}</Badge> },
    { id: "detail", header: "Detalhe", hideBelow: "md", cell: (l) => <span className="text-fg-subtle">{SHOW_DETAIL.has(l.action) ? (l.detail ?? "—") : "—"}</span> },
  ];
  const exportCsv = () => {
    downloadCsv(`draw-log-de-acessos-${new Date().toISOString().slice(0, 10)}`, ["Quando", "Usuário", "Ação", "Detalhe"], (q.data ?? []).map((l) => [dateTime(l.at), l.userName, ACTION[l.action].label, l.detail ?? ""]));
    toast.success("CSV exportado");
  };
  return (
    <>
    <Toolbar>
      <FilterSelect label="Pessoa" icon="user" value={f.pessoa || null} options={(people.data ?? []).map((u) => ({ value: u.id, label: u.name }))} searchPlaceholder="Buscar pessoa…" onChange={(v) => setF({ pessoa: v ?? "" })} />
      <FilterSelect label="Ação" value={f.acao || null} options={(Object.keys(ACTION) as Row["action"][]).map((a) => ({ value: a, label: ACTION[a].label }))} searchPlaceholder="Buscar ação…" onChange={(v) => setF({ acao: v ?? "" })} />
      <FilterSelect label="Período" value={f.periodo || null} options={PERIODS} onChange={(v) => setF({ periodo: v ?? "" })} />
      <ClearFiltersButton show={!!(f.pessoa || f.acao || f.periodo)} onClick={() => setF({ pessoa: "", acao: "", periodo: "" })} />
      <span className="flex-1" />
      <Button size="xs" variant="ghost" icon="download" disabled={!q.data?.length} onClick={exportCsv}>
        Exportar CSV
      </Button>
    </Toolbar>
    <DataTable
      pageSize={25}
      rows={q.data}
      columns={columns}
      getRowId={(l) => l.id}
      isLoading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={f.pessoa || f.acao || f.periodo ? { icon: "search", title: "Nada com esses filtros", description: "Amplie o período ou limpe os filtros." } : { icon: "history", title: "Nenhum acesso registrado ainda", description: "Logins, tentativas falhas, senhas, 2FA, convites, mudanças de perfil, inativações e leituras de segredos aparecem aqui assim que acontecerem." }}
    />
    </>
  );
}
