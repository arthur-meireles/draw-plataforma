/**
 * Regras financeiras compartilhadas (M5) — funções puras usadas por recebíveis, cadastros, projetos e indicadores,
 * para que "vencido", prazo do cliente e destinatários financeiros sejam calculados do mesmo jeito em todas as telas.
 */
import type { Database, ID, Project, ProposalInstallment, Receivable, ReceivableStatus } from "../types";

const DAY = 86_400_000;

/**
 * RN-45 — status efetivo do recebível: `previsto`/`faturado` com vencimento (`expectedAt`) anterior a ontem vira
 * `vencido`. O banco guarda o status de trabalho; "vencido" é sempre derivado (lista, ficha do cliente, prontuário,
 * visão geral, cartão do projeto e alertas usam esta função).
 */
export function effectiveReceivableStatus(r: Pick<Receivable, "status" | "expectedAt">, now: number = Date.now()): ReceivableStatus {
  if ((r.status === "previsto" || r.status === "faturado") && new Date(r.expectedAt).getTime() < now - DAY) return "vencido";
  return r.status;
}

export const addDaysIso = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();

/** Prazo do cliente em dias após o gatilho (planilha: Obs Política Pagto Cliente). `null` = sem prazo cadastrado. */
export function clientTermDays(db: Database, clientId: ID): number | null {
  const d = db.clients.find((c) => c.id === clientId)?.paymentTermDays;
  return d != null && d >= 0 ? d : null;
}

/**
 * RN-45 — vencimento de uma parcela gerada na aprovação (RN-01): data informada na parcela vale; sem data, o
 * vencimento é o gatilho (aprovação para "Na aprovação"; prazo do projeto para as demais) + prazo do cliente.
 * Sem prazo cadastrado, mantém o padrão anterior (+5 dias da aprovação; prazo do projeto ou +45 dias).
 * Devolve também a regra aplicada, que aparece no lançamento.
 */
export function installmentDue(db: Database, p: Project, i: Pick<ProposalInstallment, "dueAt" | "dueRule">, nowIso: string): { expectedAt: string; basis: string } {
  if (i.dueAt) return { expectedAt: i.dueAt, basis: "Data definida na parcela da proposta" };
  const term = clientTermDays(db, p.clientId);
  const onApproval = i.dueRule === "Na aprovação";
  if (term != null) {
    const trigger = onApproval ? nowIso : (p.dueAt ?? nowIso);
    const label = onApproval ? "Aprovação" : p.dueAt ? "Prazo do projeto" : "Aprovação (projeto sem prazo)";
    return { expectedAt: addDaysIso(trigger, term), basis: `${label} + ${term} dias (prazo do cliente)` };
  }
  if (onApproval) return { expectedAt: addDaysIso(nowIso, 5), basis: "Aprovação + 5 dias (cliente sem prazo cadastrado)" };
  if (p.dueAt) return { expectedAt: p.dueAt, basis: "Prazo do projeto (cliente sem prazo cadastrado)" };
  return { expectedAt: addDaysIso(nowIso, 45), basis: "Aprovação + 45 dias (cliente e projeto sem prazo)" };
}

/** Vencimento sugerido a partir da emissão da NF + prazo do cliente (RN-45). `null` quando o cliente não tem prazo. */
export function dueFromInvoice(db: Database, clientId: ID, issuedAt: string): string | null {
  const term = clientTermDays(db, clientId);
  return term == null ? null : addDaysIso(issuedAt, term);
}

/**
 * RN-46 — quem do Financeiro está "envolvido" num movimento financeiro (Caixa de entrada, RN-53):
 * 1) usuários do Financeiro que são da equipe do projeto (o financeiro responsável por ele);
 * 2) sem ninguém do Financeiro na equipe: todas as pessoas ativas do perfil Financeiro (é o trabalho delas);
 * 3) sem nenhum usuário Financeiro ativo: os administradores (alguém precisa agir).
 * O Administrador não recebe tudo: só entra no caso 3 ou se for da equipe/responsável.
 */
export function financeAudience(db: Database, p?: Project | null): ID[] {
  const active = db.users.filter((u) => u.status === "ativo" && !u.deletedAt);
  const finance = active.filter((u) => u.role === "financeiro");
  if (p) {
    const inTeam = finance.filter((u) => db.projectMembers.some((m) => m.projectId === p.id && m.userId === u.id && m.active && !m.deletedAt));
    if (inTeam.length) return inTeam.map((u) => u.id);
  }
  if (finance.length) return finance.map((u) => u.id);
  return active.filter((u) => u.role === "admin").map((u) => u.id);
}

/** Mascara um documento/chave mostrando só os 4 últimos caracteres úteis (RN-48). */
export function maskTail(value: string | null | undefined, keep = 4): string | null {
  if (!value) return null;
  const clean = value.trim();
  if (clean.length <= keep) return "•".repeat(clean.length);
  return `•••• ${clean.slice(-keep)}`;
}
