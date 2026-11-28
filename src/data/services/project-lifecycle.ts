/**
 * Reversões do ciclo de vida do projeto (furos altos da onda 2):
 * desfazer aprovação (RN-58), reabrir concluído e reativar cancelado (RN-59).
 * Cada ação exige motivo, registra evento e avisa responsável e equipe (RN-53).
 */
import { nowIso } from "../db";
import { PROJECT_STAGES } from "../reference";
import type { Database, ID, Project, User } from "../types";
import { ApiError, assertProjectVisible, emit, read, requireAccess, touch, write } from "./_core";
import { notifyMany, projectAudience } from "./audience";
import { canSeeMoney, canWriteAll } from "@/lib/permissions";

/** Etapas de execução (tarefas geradas na ativação pertencem a elas). */
const EXECUTION_STAGES = new Set<string>(PROJECT_STAGES.map((s) => s.key));

const requireReason = (reason: string) => {
  if (!reason?.trim()) throw new ApiError(422, "Informe o motivo.", { reason: "Informe o motivo" });
  return reason.trim();
};

const financeTeam = (db: Database) => db.users.filter((u) => ["financeiro", "gestao"].includes(u.role) && u.status === "ativo").map((u) => u.id);

/** O que a reversão da aprovação faria — ou por que está bloqueada. */
function undoApprovalPlan(db: Database, p: Project) {
  const blockers: string[] = [];
  if (p.status !== "ativo") blockers.push("O projeto não está ativo.");
  const proposal = db.proposals.find((x) => x.projectId === p.id && x.status === "aprovada" && !x.deletedAt) ?? null;
  if (p.origin !== "cotacao" || !proposal) blockers.push("Só projetos que vieram de uma proposta aprovada voltam para cotação.");
  const recs = db.receivables.filter((r) => r.projectId === p.id && !r.deletedAt && r.status !== "cancelado");
  const billed = recs.filter((r) => r.issuedAt || r.status !== "previsto");
  if (billed.length) blockers.push(`${billed.length} recebível(is) já faturado(s) ou recebido(s). Cancele a NF no Financeiro antes.`);
  const payables = db.payables.filter((x) => x.projectId === p.id && !x.deletedAt && x.status !== "cancelado");
  if (payables.length) blockers.push(`${payables.length} conta(s) a pagar já criada(s) para o projeto.`);
  const tasks = db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt && t.statusKey !== "concluida" && t.stageKey && EXECUTION_STAGES.has(t.stageKey));
  return { proposal, receivables: recs, tasks, blockers };
}

export const projectLifecycleApi = {
  /** Prévia do "Desfazer aprovação…" (o diálogo mostra o que será removido ou o bloqueio). */
  undoApprovalPreview: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      const plan = undoApprovalPlan(db, p);
      return { allowed: plan.blockers.length === 0, blockers: plan.blockers, proposalVersion: plan.proposal?.version ?? null, receivables: plan.receivables.length, openTasks: plan.tasks.length };
    }),

  /**
   * RN-58 — desfaz a aprovação feita por engano enquanto nada foi faturado/recebido nem pago: proposta volta a
   * `enviada`, projeto volta a `cotacao/negociacao`, recebíveis previstos e tarefas abertas de execução saem
   * (soft delete; `keepTasks` mantém as tarefas), aprovações pendentes do cliente são retiradas.
   */
  undoApproval: (projectId: ID, input: { reason: string; keepTasks?: boolean }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      requireAccess(me, "commercial", "all", "Só o Comercial, a gestão e a administração desfazem a aprovação de uma proposta.");
      requireAccess(me, "projects", "all", "Só a gestão e a administração fazem isso no projeto.");
      if (!canSeeMoney(me)) throw new ApiError(403, "Seu perfil não tem acesso a valores e propostas.");
      const reason = requireReason(input.reason);
      const plan = undoApprovalPlan(db, p);
      if (plan.blockers.length) throw new ApiError(409, `Não é possível desfazer a aprovação: ${plan.blockers.join(" ")}`);
      const now = nowIso();
      const prop = plan.proposal!;
      prop.status = "enviada";
      prop.approvedAt = null;
      touch(prop);
      plan.receivables.forEach((r) => {
        r.deletedAt = now;
        touch(r);
      });
      const removedTasks = input.keepTasks ? [] : plan.tasks;
      removedTasks.forEach((t) => {
        t.deletedAt = now;
        db.tasks.filter((s) => s.parentTaskId === t.id && !s.deletedAt).forEach((s) => (s.deletedAt = now));
      });
      db.approvals.filter((a) => a.projectId === p.id && a.decision === "pendente" && !a.deletedAt).forEach((a) => (a.deletedAt = now));
      const from = p.projectStageKey;
      p.status = "cotacao";
      p.quoteStageKey = "negociacao";
      p.projectStageKey = null;
      p.approvedAt = null;
      p.startedAt = null;
      p.contractedAmountCents = null;
      p.paymentCondition = null;
      p.pausedAt = null;
      p.pausedReason = null;
      touch(p);
      emit(db, me, {
        type: "proposal.approval_undone",
        entityType: "proposal",
        entityId: prop.id,
        project: p,
        data: { version: prop.version, reason, fromStage: from, receivablesRemoved: plan.receivables.length, tasksRemoved: removedTasks.length },
      });
      const n = { type: "projeto" as const, title: "Aprovação desfeita — projeto voltou para cotação", body: `Motivo: ${reason}`, project: p };
      notifyMany(db, me, projectAudience(db, p), n);
      notifyMany(db, me, financeTeam(db), { ...n, type: "aprovacao" });
      return p;
    }),

  /** RN-59 — reabre projeto concluído (ajuste pedido depois da entrega ou conclusão por engano). */
  reopenCompleted: (projectId: ID, reason: string) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      requireAccess(me, "projects", "all", "Só a gestão e a administração reabrem projetos concluídos.");
      if (p.status !== "concluido") throw new ApiError(409, "Só projetos concluídos podem ser reabertos. Para arquivados, desarquive primeiro.");
      const why = requireReason(reason);
      const completedAt = p.completedAt;
      p.status = "ativo";
      p.projectStageKey = "validacao_cliente";
      p.completedAt = null;
      touch(p);
      const payables = db.payables.filter((x) => x.projectId === p.id && !x.deletedAt).length;
      emit(db, me, { type: "project.reopened", entityType: "project", entityId: p.id, project: p, data: { kind: "concluido", reason: why, completedAt, payablesKept: payables } });
      notifyMany(db, me, projectAudience(db, p), { type: "projeto", title: "Projeto reaberto", body: `Motivo: ${why}`, project: p });
      return p;
    }),

  /** RN-59 — reativa projeto cancelado: volta a `ativo` na mesma etapa e devolve a `previsto` os recebíveis que o cancelamento derrubou. */
  reactivateCancelled: (projectId: ID, reason: string) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      requireAccess(me, "projects", "all", "Só a gestão e a administração reativam projetos cancelados.");
      if (p.status !== "cancelado") throw new ApiError(409, "Só projetos cancelados podem ser reativados. Para arquivados, desarquive primeiro.");
      const why = requireReason(reason);
      const cancelEvent = db.events
        .filter((e) => e.projectId === p.id && e.type === "project.cancelled")
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
      const ids = new Set<ID>(((cancelEvent?.data.cancelledReceivableIds as ID[] | undefined) ?? []));
      const restored = db.receivables.filter((r) => ids.has(r.id) && r.status === "cancelado" && !r.deletedAt);
      restored.forEach((r) => {
        r.status = "previsto";
        touch(r);
      });
      // RN-86 — contas de freelancer que o cancelamento derrubou voltam a aguardar a NF
      const payIds = new Set<ID>(((cancelEvent?.data.cancelledPayableIds as ID[] | undefined) ?? []));
      db.payables.filter((x) => payIds.has(x.id) && x.status === "cancelado" && !x.deletedAt).forEach((x) => {
        x.status = "aguardando_nf";
        x.cancelReason = null;
        const req = db.freelancerInvoiceRequests.find((r) => r.payableId === x.id);
        const link = req ? db.shareLinks.find((s) => s.id === req.shareLinkId) : null;
        if (link) link.revokedAt = null;
        touch(x);
      });
      p.status = "ativo";
      p.projectStageKey = p.projectStageKey && p.projectStageKey !== "concluido" ? p.projectStageKey : "validacao_cliente";
      p.lostReason = null;
      touch(p);
      emit(db, me, { type: "project.reactivated", entityType: "project", entityId: p.id, project: p, data: { reason: why, receivablesRestored: restored.length } });
      notifyMany(db, me, projectAudience(db, p), { type: "projeto", title: "Projeto reativado", body: `Motivo: ${why}`, project: p });
      if (restored.length) notifyMany(db, me, financeTeam(db), { type: "projeto", title: "Projeto reativado — recebíveis voltaram a previstos", body: `${restored.length} recebível(is) restaurado(s)`, project: p });
      return p;
    }),
};

/* ───────── RN-73 — encerramento: conclusão fatura a entrega; cancelamento encerra o que está aberto ───────── */

const isDeliveryInstallment = (db: Database, r: Database["receivables"][number]) => {
  const rule = r.proposalInstallmentId ? db.proposalInstallments.find((i) => i.id === r.proposalInstallmentId)?.dueRule : null;
  return /entrega/i.test(rule ?? "") || /entrega/i.test(r.description);
};

/** Na conclusão: parcelas "Na entrega" previstas para depois de hoje passam a vencer hoje; o Financeiro é avisado do que faturar. */
export function billDeliveryOnCompletion(db: Database, me: User, p: Project) {
  const today = new Date();
  const pending = db.receivables.filter((r) => r.projectId === p.id && !r.deletedAt && r.status === "previsto");
  const moved: { id: ID; from: string }[] = [];
  pending.filter((r) => isDeliveryInstallment(db, r) && new Date(r.expectedAt) > today).forEach((r) => {
    moved.push({ id: r.id, from: r.expectedAt });
    r.expectedAt = today.toISOString();
    touch(r);
  });
  if (moved.length) emit(db, me, { type: "receivable.delivery_due", entityType: "project", entityId: p.id, project: p, data: { count: moved.length, receivables: moved } });
  if (pending.length)
    notifyMany(db, me, financeTeam(db), { type: "projeto", title: `Projeto concluído: ${pending.length} parcela(s) a faturar`, body: moved.length ? `${moved.length} parcela(s) "na entrega" agora vencem hoje` : undefined, project: p });
  return moved.length;
}

/** O que o cancelamento afeta (prévia do diálogo). */
function cancelImpact(db: Database, p: Project) {
  const invoiced = db.receivables.filter((r) => r.projectId === p.id && !r.deletedAt && r.status !== "cancelado" && r.status !== "recebido" && !!r.issuedAt);
  const openTasks = db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt && t.statusKey !== "concluida").length;
  const pendingApprovals = db.approvals.filter((a) => a.projectId === p.id && a.decision === "pendente" && !a.deletedAt);
  const freelancers = db.projectMembers
    .filter((m) => m.projectId === p.id && !m.deletedAt && m.freelancerId && !m.paymentWaived && !db.payables.some((x) => x.projectMemberId === m.id && !x.deletedAt && x.status !== "cancelado"))
    .map((m) => ({ memberId: m.id, name: db.freelancers.find((f) => f.id === m.freelancerId)?.name ?? "Freelancer", agreedAmountCents: m.agreedAmountCents }));
  const previsto = db.receivables.filter((r) => r.projectId === p.id && !r.deletedAt && r.status === "previsto").length;
  return { invoiced, openTasks, pendingApprovals, freelancers, previsto };
}

/** No cancelamento: retira aprovações pendentes e links abertos ao cliente; avisa Financeiro (NF emitida) e contas a pagar (freelancers sem pagamento). */
export function closeOnCancel(db: Database, me: User, p: Project) {
  const now = nowIso();
  const impact = cancelImpact(db, p);
  impact.pendingApprovals.forEach((a) => {
    a.deletedAt = now;
    touch(a);
  });
  const links = db.shareLinks.filter((l) => l.projectId === p.id && ["proposta", "aprovacao", "entrega"].includes(l.purpose) && !l.revokedAt && !l.response);
  links.forEach((l) => (l.revokedAt = now));
  if (impact.invoiced.length)
    notifyMany(db, me, financeTeam(db), { type: "projeto", title: `Projeto cancelado com ${impact.invoiced.length} NF(s) emitida(s)`, body: "Revise a cobrança ou o cancelamento das notas em A receber", project: p });
  const payers = db.users.filter((u) => u.status === "ativo" && canWriteAll(u, "payables")).map((u) => u.id);
  if (impact.freelancers.length)
    notifyMany(db, me, payers, { type: "projeto", title: "Projeto cancelado: freelancers sem pagamento", body: `${impact.freelancers.map((f) => f.name).join(", ")} — avalie pagamento proporcional na aba Equipe`, project: p });
  return { approvalsWithdrawn: impact.pendingApprovals.length, linksRevoked: links.length, invoicedOpen: impact.invoiced.length, freelancersWithoutPayment: impact.freelancers.length, openTasks: impact.openTasks };
}

export const projectClosingApi = {
  /** Prévia do "Cancelar projeto…" (RN-73). */
  cancelPreview: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      const i = cancelImpact(db, p);
      const money = canSeeMoney(me);
      return {
        receivablesToCancel: i.previsto,
        invoicedOpen: i.invoiced.length,
        invoicedOpenCents: money ? i.invoiced.reduce((a, r) => a + r.amountCents, 0) : null,
        openTasks: i.openTasks,
        pendingApprovals: i.pendingApprovals.length,
        freelancers: i.freelancers.map((f) => ({ ...f, agreedAmountCents: money ? f.agreedAmountCents : null })),
      };
    }),
};
