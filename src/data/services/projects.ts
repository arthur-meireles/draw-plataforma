import { baseFields, nowIso } from "../db";
import { FIRST_PROJECT_STAGE, PROJECT_STAGES, QUOTE_TASK_TEMPLATE, STAGE_DEFAULT_ROLE } from "../reference";
import type {
  Database,
  ID,
  MemberRole,
  PaymentCondition,
  PriorityKey,
  Project,
  ProjectSize,
  ProjectFinancials,
  ProjectMember,
  ProjectStageKey,
  QuoteStageKey,
  Task,
  User,
} from "../types";
import {
  ApiError,
  assertProjectVisible,
  requireAccess,
  emit,
  emitValueChange,
  notify,
  read,
  redactProject,
  taxOf,
  touch,
  visibleProjects,
  write,
} from "./_core";
import { freelancerUserId, notifyMany, projectAudience } from "./audience";
import { canSeeMoney, canWriteAll } from "@/lib/permissions";
import { settleCompletionPayables, type CompletionDecision } from "./payables-extra";
import { afterCompletionTeamChange } from "./team-after-completion";
import { billDeliveryOnCompletion, closeOnCancel } from "./project-lifecycle";
import { effectiveReceivableStatus } from "./finance-rules";
import { newProjectErrors, notifyDirectCreated, notifyOwner, propagateClientChange, recomputeDeliveryDue, validateNewProject, withdrawIdleApprovals, closeOpenProjectTasks } from "./project-intake";

export interface ProjectFilters {
  status?: Project["status"][];
  clientId?: ID;
  projectTypeId?: ID;
  ownerId?: ID;
  memberUserId?: ID;
  memberFreelancerId?: ID;
  priority?: PriorityKey;
  due?: "atrasado" | "semana" | "mes";
  q?: string;
  from?: string;
  to?: string;
}

export interface ProjectListItem extends Project {
  clientName: string;
  typeName: string;
  typePrefix: string;
  typeIcon: string;
  members: { id: ID; userId: ID | null; freelancerId: ID | null; name: string; color: string; role: MemberRole }[];
  subtasksDone: number;
  subtasksTotal: number;
  tasksOpen: number;
  isOverdue: boolean;
  pendingApproval: boolean;
  billingStatus: "sem_faturamento" | "a_faturar" | "parcial" | "faturado" | "recebido" | "vencido";
}

/** RN-05 — próximo código do prefixo (também usado pela importação da planilha master). */
export const nextCode = (db: Database, prefix: string) => {
  db.codeSequences[prefix] = (db.codeSequences[prefix] ?? 0) + 1;
  return `${prefix}-${String(db.codeSequences[prefix]).padStart(3, "0")}`;
};

export function memberDisplay(db: Database, m: ProjectMember) {
  if (m.userId) {
    const u = db.users.find((x) => x.id === m.userId);
    return { name: u?.name ?? "—", color: u?.avatarColor ?? "#888" };
  }
  const f = db.freelancers.find((x) => x.id === m.freelancerId);
  return { name: f?.name ?? "—", color: f?.avatarColor ?? "#888" };
}

export function toListItem(db: Database, p: Project, me: User): ProjectListItem {
  const client = db.clients.find((c) => c.id === p.clientId);
  const type = db.projectTypes.find((t) => t.id === p.projectTypeId);
  const tasks = db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt);
  const recs = db.receivables.filter((r) => r.projectId === p.id && !r.deletedAt && r.status !== "cancelado");
  const billingStatus: ProjectListItem["billingStatus"] =
    recs.length === 0
      ? "sem_faturamento"
      : recs.some((r) => effectiveReceivableStatus(r) === "vencido")
        ? "vencido"
        : recs.every((r) => r.status === "recebido")
        ? "recebido"
        : recs.every((r) => r.status !== "previsto")
          ? "faturado"
          : recs.some((r) => r.status !== "previsto")
            ? "parcial"
            : "a_faturar";
  const done = p.status === "concluido" || p.status === "arquivado";
  return {
    ...redactProject(p, me),
    clientName: client?.tradeName ?? "—",
    typeName: type?.name ?? "—",
    typePrefix: type?.codePrefix ?? "",
    typeIcon: type?.icon ?? "folder",
    members: db.projectMembers
      .filter((m) => m.projectId === p.id && m.active && !m.deletedAt)
      .map((m) => ({ id: m.id, userId: m.userId, freelancerId: m.freelancerId, role: m.memberRole, ...memberDisplay(db, m) })),
    subtasksDone: tasks.filter((t) => t.statusKey === "concluida").length,
    subtasksTotal: tasks.length,
    tasksOpen: tasks.filter((t) => t.statusKey !== "concluida").length,
    isOverdue: !done && !p.pausedAt && !!p.dueAt && new Date(p.dueAt).getTime() < Date.now(),
    pendingApproval: db.approvals.some((a) => a.projectId === p.id && a.decision === "pendente" && !a.deletedAt),
    billingStatus: canSeeMoney(me) ? billingStatus : "sem_faturamento",
  };
}

function applyFilters(db: Database, rows: Project[], f: ProjectFilters): Project[] {
  const q = f.q?.trim().toLowerCase();
  const now = Date.now();
  return rows.filter((p) => {
    if (f.status && !f.status.includes(p.status)) return false;
    if (f.clientId && p.clientId !== f.clientId) return false;
    if (f.projectTypeId && p.projectTypeId !== f.projectTypeId) return false;
    if (f.ownerId && p.ownerId !== f.ownerId) return false;
    if (f.priority && p.priorityKey !== f.priority) return false;
    if (f.memberUserId && p.ownerId !== f.memberUserId && !db.projectMembers.some((m) => m.projectId === p.id && m.active && m.userId === f.memberUserId)) return false;
    if (f.memberFreelancerId && !db.projectMembers.some((m) => m.projectId === p.id && m.active && m.freelancerId === f.memberFreelancerId)) return false;
    if (f.from && new Date(p.enteredAt) < new Date(f.from)) return false;
    if (f.to && new Date(p.enteredAt) > new Date(f.to)) return false;
    if (f.due) {
      if (!p.dueAt) return false;
      const due = new Date(p.dueAt).getTime();
      if (f.due === "atrasado" && due >= now) return false;
      if (f.due === "semana" && (due < now || due > now + 7 * 86_400_000)) return false;
      if (f.due === "mes" && (due < now || due > now + 30 * 86_400_000)) return false;
    }
    if (q) {
      const client = db.clients.find((c) => c.id === p.clientId);
      const hay = `${p.code} ${p.title} ${client?.tradeName ?? ""} ${client?.legalName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** RN-56 — campos que a Operação pode editar no projeto em que está alocada. */
const OPERATION_EDITABLE = ["title", "briefing", "priorityKey", "size", "dueAt", "estimatedEndAt"] as const;

export const projectsApi = {
  list: (filters: ProjectFilters = {}) =>
    read((db, me) =>
      applyFilters(db, visibleProjects(db, me), filters)
        .sort((a, b) => a.position - b.position)
        .map((p) => toListItem(db, p, me)),
    ),

  get: (codeOrId: string) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, codeOrId);
      const client = db.clients.find((c) => c.id === p.clientId)!;
      const billingContact = db.clientContacts.find((c) => c.id === p.billingContactId) ?? null;
      const owner = db.users.find((u) => u.id === p.ownerId) ?? null;
      return { ...toListItem(db, p, me), client, billingContact, owner };
    }),

  /** RF-M3-02 — cria projeto em cotação. */
  createQuote: (input: { clientId: ID; projectTypeId: ID; title: string; ownerId: ID; briefing?: string; priorityKey?: PriorityKey; dueAt?: string | null; size?: ProjectSize | null }) =>
    write((db, me) => {
      if (!canWriteAll(me, "commercial")) throw new ApiError(403, "Seu perfil não pode criar cotações.");
      validateNewProject(db, input); // RN-95
      const type = db.projectTypes.find((t) => t.id === input.projectTypeId)!;
      const billing = db.clientContacts.find((c) => c.clientId === input.clientId && c.isBillingContact);
      const now = nowIso();
      const p: Project = {
        ...baseFields(me.id),
        clientId: input.clientId,
        projectTypeId: input.projectTypeId,
        code: nextCode(db, type.codePrefix),
        title: input.title.trim(),
        briefing: input.briefing?.trim() || null,
        origin: "cotacao",
        status: "cotacao",
        quoteStageKey: "entrada",
        projectStageKey: null,
        priorityKey: input.priorityKey ?? "media",
        position: -Date.now() / 1000,
        ownerId: input.ownerId,
        billingContactId: billing?.id ?? null,
        enteredAt: now,
        quoteSentAt: null,
        approvedAt: null,
        startedAt: null,
        dueAt: input.dueAt ?? null,
        estimatedEndAt: null,
        completedAt: null,
        archivedAt: null,
        contractedAmountCents: null,
        lostReason: null,
        isEnvironment: false,
        size: input.size ?? null,
        pausedAt: null,
        pausedReason: null,
        legacyCode: null,
        paymentCondition: null,
        statusBeforeArchive: null,
      };
      db.projects.push(p);
      db.projectMembers.push({ ...baseFields(me.id), projectId: p.id, userId: input.ownerId, freelancerId: null, memberRole: "responsavel", agreedAmountCents: null, active: true });
      generateQuoteTasks(db, me, p);
      emit(db, me, { type: "project.created", entityType: "project", entityId: p.id, project: p, data: { origin: "cotacao" } });
      notify(db, me, { userId: input.ownerId, type: "atribuicao", title: "Você é responsável por uma nova cotação", project: p });
      return p;
    }),

  /** RF-M4-01 / RN-02 — projeto direto, já ativo, com recebíveis. */
  createDirect: (input: {
    clientId: ID;
    projectTypeId: ID;
    title: string;
    ownerId: ID;
    briefing?: string;
    priorityKey?: PriorityKey;
    contractedAmountCents: number;
    installments: { description: string; amountCents: number; expectedAt: string }[];
    team: { userId?: ID | null; freelancerId?: ID | null; memberRole: MemberRole; agreedAmountCents?: number | null }[];
    dueAt: string | null;
    size?: ProjectSize | null;
    paymentCondition?: PaymentCondition | null;
  }) =>
    write((db, me) => {
      if (!canWriteAll(me, "projects")) throw new ApiError(403, "Seu perfil não pode criar projetos.");
      const errors = newProjectErrors(db, input); // RN-95 — o serviço não confia no assistente
      if (!input.contractedAmountCents || input.contractedAmountCents <= 0) errors.contractedAmountCents = "Informe o valor contratado";
      if (!input.installments.length) errors.installments = "Informe ao menos uma parcela";
      const sum = input.installments.reduce((a, i) => a + i.amountCents, 0);
      if (input.installments.length && sum !== input.contractedAmountCents) errors.installments = "A soma das parcelas deve ser igual ao valor contratado";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const type = db.projectTypes.find((t) => t.id === input.projectTypeId)!;
      const billing = db.clientContacts.find((c) => c.clientId === input.clientId && c.isBillingContact);
      const now = nowIso();
      const p: Project = {
        ...baseFields(me.id),
        clientId: input.clientId,
        projectTypeId: input.projectTypeId,
        code: nextCode(db, type.codePrefix),
        title: input.title.trim(),
        briefing: input.briefing?.trim() || null,
        origin: "direto",
        status: "ativo",
        quoteStageKey: null,
        projectStageKey: FIRST_PROJECT_STAGE,
        priorityKey: input.priorityKey ?? "media",
        position: -Date.now() / 1000,
        ownerId: input.ownerId,
        billingContactId: billing?.id ?? null,
        enteredAt: now,
        quoteSentAt: null,
        approvedAt: now,
        startedAt: now,
        dueAt: input.dueAt,
        estimatedEndAt: input.dueAt,
        completedAt: null,
        archivedAt: null,
        contractedAmountCents: input.contractedAmountCents,
        lostReason: null,
        isEnvironment: false,
        size: input.size ?? null,
        pausedAt: null,
        pausedReason: null,
        legacyCode: null,
        paymentCondition: input.paymentCondition ?? null,
        statusBeforeArchive: null,
      };
      db.projects.push(p);
      const team = [{ userId: input.ownerId, memberRole: "responsavel" as MemberRole }, ...input.team.filter((t) => t.userId !== input.ownerId || t.freelancerId)];
      for (const t of team) {
        db.projectMembers.push({
          ...baseFields(me.id),
          projectId: p.id,
          userId: t.userId ?? null,
          freelancerId: "freelancerId" in t ? (t.freelancerId ?? null) : null,
          memberRole: t.memberRole,
          agreedAmountCents: "agreedAmountCents" in t ? (t.agreedAmountCents ?? null) : null,
          active: true,
        });
      }
      for (const inst of input.installments) {
        db.receivables.push({
          ...baseFields(me.id),
          projectId: p.id,
          clientId: p.clientId,
          proposalInstallmentId: null,
          description: inst.description,
          amountCents: inst.amountCents,
          taxCents: taxOf(db, inst.amountCents),
          kind: "parcela",
          collectionNote: null,
          expectedAt: inst.expectedAt,
          invoiceNumber: null,
          invoiceFileId: null,
          issuedAt: null,
          receivedAt: null,
          status: "previsto",
        });
      }
      generateTasksFromTemplate(db, me, p);
      emit(db, me, { type: "project.direct_created", entityType: "project", entityId: p.id, project: p, data: { contractedAmountCents: p.contractedAmountCents, installments: input.installments.length } });
      notifyDirectCreated(db, me, p, input.installments.length); // RN-96
      return p;
    }),

  update: (id: ID, patch: Partial<Pick<Project, "title" | "briefing" | "priorityKey" | "ownerId" | "dueAt" | "estimatedEndAt" | "billingContactId" | "clientId" | "contractedAmountCents" | "size" | "paymentCondition">>) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (!canWriteAll(me, "projects") && !(me.role === "operacao")) throw new ApiError(403, "Sem permissão para editar o projeto.");
      // RN-56 — Operação (escopo P) edita só a execução do projeto em que está alocada.
      if (!canWriteAll(me, "projects")) {
        const blocked = Object.keys(patch).filter((k) => !OPERATION_EDITABLE.includes(k as (typeof OPERATION_EDITABLE)[number]));
        if (blocked.length) throw new ApiError(403, "Seu perfil edita só título, briefing, prioridade, tamanho e prazos. Peça à gestão para mudar responsável, cliente, faturamento ou valores.");
      }
      if (patch.clientId && patch.clientId !== p.clientId) {
        const issued = db.receivables.some((r) => r.projectId === p.id && r.issuedAt);
        if (issued) throw new ApiError(409, "Este projeto já tem nota fiscal emitida e não pode trocar de cliente (RN-12).");
      }
      if ("contractedAmountCents" in patch) {
        if (!canSeeMoney(me)) throw new ApiError(403, "Sem permissão para alterar valores.");
        emitValueChange(db, me, "project", p.id, p, "contractedAmountCents", p.contractedAmountCents, patch.contractedAmountCents);
      }
      if (patch.ownerId && patch.ownerId !== p.ownerId) {
        const owner = db.users.find((u) => u.id === patch.ownerId);
        if (!owner || owner.status !== "ativo" || owner.role === "freelancer") throw new ApiError(422, "Escolha um responsável ativo da equipe interna.", { ownerId: "Escolha um responsável ativo da equipe interna" });
      }
      const before = { ...p };
      Object.assign(p, patch);
      touch(p);
      if (patch.ownerId && patch.ownerId !== before.ownerId) syncOwnerMember(db, me, p, before.ownerId);
      if (patch.clientId && patch.clientId !== before.clientId) propagateClientChange(db, p); // RN-98
      if (patch.dueAt !== undefined && patch.dueAt !== before.dueAt && p.status === "ativo") recomputeDeliveryDue(db, me, p); // RN-97
      const changed = Object.keys(patch).filter((k) => (before as unknown as Record<string, unknown>)[k] !== (p as unknown as Record<string, unknown>)[k]);
      if (changed.length) emit(db, me, { type: "project.updated", entityType: "project", entityId: p.id, project: p, data: { fields: changed } });
      if (patch.ownerId && patch.ownerId !== before.ownerId) notify(db, me, { userId: patch.ownerId, type: "atribuicao", title: "Você agora é responsável pelo projeto", project: p });
      return p;
    }),

  /** Arrastar no kanban: muda etapa e/ou posição (RF-M4-07). */
  move: (id: ID, input: { stageKey: ProjectStageKey | QuoteStageKey; position: number }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (p.status === "cotacao") requireAccess(me, "commercial", "all", "Só o Comercial, a gestão e a administração movem cotações no funil.");
      else requireAccess(me, "projects", "write", "Seu perfil só consulta este projeto. Peça ao responsável para mudar a etapa.");
      if (me.role === "freelancer") throw new ApiError(403, "A etapa do projeto é mudada pela equipe da Draw.");
      if (p.status === "cotacao") {
        const to = input.stageKey as QuoteStageKey;
        if (to === "aprovada") throw new ApiError(422, "Para aprovar, aprove uma proposta do projeto.");
        if (to === "perdida") throw new ApiError(422, "Para marcar como perdida, informe o motivo.");
        if (to !== p.quoteStageKey) {
          emit(db, me, { type: "project.quote_stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.quoteStageKey, to } });
          p.quoteStageKey = to;
        }
      } else if (p.status === "ativo") {
        const to = input.stageKey as ProjectStageKey;
        if (to === "concluido") throw new ApiError(422, "Use \"Concluir projeto\" para finalizar e gerar os pagamentos.");
        // RN-13 — pausado não muda etapa (reordenar na mesma coluna continua livre).
        if (p.pausedAt && to !== p.projectStageKey) throw new ApiError(409, "Projeto pausado não muda de etapa. Retome o projeto primeiro.");
        if (to !== p.projectStageKey) {
          emit(db, me, { type: "project.stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.projectStageKey, to } });
          const leaving = p.projectStageKey;
          p.projectStageKey = to;
          const stage = PROJECT_STAGES.find((s) => s.key === to);
          withdrawIdleApprovals(db, me, p, leaving); // RN-101
          if (stage?.category === "waiting" && !db.approvals.some((x) => x.projectId === p.id && x.stageKey === to && x.decision === "pendente" && !x.deletedAt)) {
            db.approvals.push({ ...baseFields(me.id), projectId: p.id, stageKey: to, requestedFrom: db.clientContacts.find((c) => c.id === p.billingContactId)?.name ?? "Cliente", decision: "pendente", reason: null, decidedBy: null, decidedAt: null, requestedBy: me.id, shareLinkId: null, decidedVia: null, decidedByName: null });
          }
          // RN-53 — responsável e equipe (inclusive freelancers com acesso), nunca quem moveu.
          notifyMany(db, me, projectAudience(db, p), { type: "etapa", title: `Projeto movido para ${stage?.label}`, body: `${me.name} mudou a etapa`, project: p });
        }
      } else {
        throw new ApiError(409, "Projetos concluídos ou arquivados não mudam de etapa.");
      }
      p.position = input.position;
      touch(p);
      return p;
    }),

  /** Pausar (planilha: "Caso Parado") — exige motivo; não muda a etapa. */
  pause: (id: ID, reason: string) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      requireAccess(me, "projects", "all", "Só a gestão e a administração fazem isso no projeto.");
      if (p.status !== "ativo") throw new ApiError(409, "Só projetos ativos podem ser pausados.");
      if (!reason.trim()) throw new ApiError(422, "Informe por que o projeto está parado.", { reason: "Informe o motivo" });
      p.pausedAt = nowIso();
      p.pausedReason = reason.trim();
      touch(p);
      emit(db, me, { type: "project.paused", entityType: "project", entityId: p.id, project: p, data: { reason: p.pausedReason } });
      notifyMany(db, me, projectAudience(db, p), { type: "projeto", title: "Projeto pausado", body: `Motivo: ${p.pausedReason}`, project: p });
      return p;
    }),

  resume: (id: ID) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      requireAccess(me, "projects", "all", "Só a gestão e a administração fazem isso no projeto.");
      if (!p.pausedAt) throw new ApiError(409, "O projeto não está pausado.");
      p.pausedAt = null;
      p.pausedReason = null;
      touch(p);
      emit(db, me, { type: "project.resumed", entityType: "project", entityId: p.id, project: p });
      notifyMany(db, me, projectAudience(db, p), { type: "projeto", title: "Projeto retomado", body: `${me.name} retomou o projeto`, project: p });
      return p;
    }),

  /** RF-M3-05 — perder exige motivo. */
  markLost: (id: ID, reason: string) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      requireAccess(me, "commercial", "all", "Só o Comercial, a gestão e a administração mudam o resultado de uma cotação.");
      if (!reason.trim()) throw new ApiError(422, "Informe o motivo da perda.", { reason: "Informe o motivo da perda" });
      if (p.status !== "cotacao") throw new ApiError(409, "Só cotações podem ser marcadas como perdidas.");
      p.status = "perdido";
      p.quoteStageKey = "perdida";
      p.lostReason = reason.trim();
      touch(p);
      db.proposals.filter((pr) => pr.projectId === p.id && pr.status === "enviada").forEach((pr) => (pr.status = "recusada"));
      emit(db, me, { type: "project.lost", entityType: "project", entityId: p.id, project: p, data: { reason } });
      notifyOwner(db, me, p, "Sua cotação foi marcada como perdida", `Motivo: ${reason.trim()}`);
      return p;
    }),

  reopenQuote: (id: ID) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      requireAccess(me, "commercial", "all", "Só o Comercial, a gestão e a administração mudam o resultado de uma cotação.");
      if (p.status !== "perdido") throw new ApiError(409, "Só cotações perdidas podem ser reabertas.");
      p.status = "cotacao";
      p.quoteStageKey = "negociacao";
      p.lostReason = null;
      touch(p);
      emit(db, me, { type: "project.reopened", entityType: "project", entityId: p.id, project: p });
      notifyOwner(db, me, p, "Sua cotação foi reaberta");
      return p;
    }),

  /** RF-M4-12 / RN-03 — concluir gera contas a pagar, share links e e-mails. */
  complete: (id: ID, decisions: CompletionDecision[] = [], opts: { closeOpenTasks?: boolean } = {}) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (p.status !== "ativo") throw new ApiError(409, "Só projetos ativos podem ser concluídos.");
      if (!canWriteAll(me, "projects")) throw new ApiError(403, "Seu perfil não pode concluir projetos.");
      const now = new Date();
      // RN-40: decide antes de mudar o status — se faltar decisão, nada é gravado (422)
      const created = settleCompletionPayables(db, me, p, decisions);
      p.status = "concluido";
      emit(db, me, { type: "project.stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.projectStageKey, to: "concluido" } });
      p.projectStageKey = "concluido";
      p.completedAt = now.toISOString();
      p.pausedAt = null;
      p.pausedReason = null;
      touch(p);
      withdrawIdleApprovals(db, me, p, null); // RN-101 — pedidos sem resposta saem com a conclusão
      const closedTasks = opts.closeOpenTasks ? closeOpenProjectTasks(db, p) : 0; // RN-101 — "Concluir também as tarefas abertas"
      const deliveryDue = billDeliveryOnCompletion(db, me, p);
      emit(db, me, { type: "project.completed", entityType: "project", entityId: p.id, project: p, data: { payablesCreated: created.length, deliveryInstallmentsDue: deliveryDue, tasksClosed: closedTasks } });
      notifyMany(db, me, projectAudience(db, p), { type: "projeto", title: "Projeto concluído", body: `${me.name} concluiu o projeto`, project: p });
      return { project: p, payablesCreated: created.length };
    }),

  /** RN-07 — arquivar não apaga. */
  archive: (id: ID) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      requireAccess(me, "projects", "all", "Só a gestão e a administração fazem isso no projeto.");
      if (p.status !== "concluido" && p.status !== "perdido" && p.status !== "cancelado") throw new ApiError(409, "Só projetos concluídos, perdidos ou cancelados podem ser arquivados.");
      p.statusBeforeArchive = p.status;
      p.status = "arquivado";
      p.archivedAt = nowIso();
      touch(p);
      emit(db, me, { type: "project.archived", entityType: "project", entityId: p.id, project: p });
      return p;
    }),

  unarchive: (id: ID) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      requireAccess(me, "projects", "all", "Só a gestão e a administração fazem isso no projeto.");
      if (p.status !== "arquivado") throw new ApiError(409, "Projeto não está arquivado.");
      // RN-50 — volta exatamente ao status anterior (cancelado continua cancelado).
      p.status = p.statusBeforeArchive ?? legacyStatusBeforeArchive(db, p);
      p.statusBeforeArchive = null;
      p.archivedAt = null;
      touch(p);
      emit(db, me, { type: "project.unarchived", entityType: "project", entityId: p.id, project: p, data: { restoredStatus: p.status } });
      return p;
    }),

  cancel: (id: ID, reason: string) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (!canWriteAll(me, "projects")) throw new ApiError(403, "Seu perfil não pode cancelar projetos. Peça a quem gerencia projetos.");
      if (p.status !== "ativo") throw new ApiError(409, "Só projetos ativos podem ser cancelados. Para cotações, use \"Marcar como perdida\".");
      if (!reason.trim()) throw new ApiError(422, "Informe o motivo do cancelamento.", { reason: "Informe o motivo" });
      p.status = "cancelado";
      p.lostReason = reason.trim();
      p.pausedAt = null;
      p.pausedReason = null;
      touch(p);
      const cancelled = db.receivables.filter((r) => r.projectId === p.id && r.status === "previsto" && !r.deletedAt);
      cancelled.forEach((r) => (r.status = "cancelado"));
      // RN-59 — guarda quais recebíveis o cancelamento derrubou para a reativação devolver.
      // RN-73 — retira pendências com o cliente e avisa Financeiro/contas a pagar do que segue em aberto
      const closing = closeOnCancel(db, me, p);
      emit(db, me, { type: "project.cancelled", entityType: "project", entityId: p.id, project: p, data: { reason, cancelledReceivableIds: cancelled.map((r) => r.id), ...closing } });
      notifyMany(db, me, projectAudience(db, p), { type: "projeto", title: "Projeto cancelado", body: `Motivo: ${reason.trim()}`, project: p });
      return p;
    }),

  /* ───────── equipe ───────── */
  members: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      const money = canSeeMoney(me);
      return db.projectMembers
        .filter((m) => m.projectId === p.id && !m.deletedAt)
        .map((m) => {
          const u = m.userId ? db.users.find((x) => x.id === m.userId) : null;
          const f = m.freelancerId ? db.freelancers.find((x) => x.id === m.freelancerId) : null;
          return {
            ...m,
            agreedAmountCents: money ? m.agreedAmountCents : null,
            name: u?.name ?? f?.name ?? "—",
            email: u?.email ?? f?.email ?? "",
            jobTitle: u?.jobTitle ?? f?.jobTitle ?? null,
            color: u?.avatarColor ?? f?.avatarColor ?? "#888",
            kind: (u ? "interno" : "freelancer") as "interno" | "freelancer",
            openTasks: db.tasks.filter((t) => t.projectId === p.id && t.statusKey !== "concluida" && !t.deletedAt && ((u && t.assigneeUserId === u.id) || (f && t.assigneeFreelancerId === f.id))).length,
          };
        });
    }),

  addMember: (projectId: ID, input: { userId?: ID | null; freelancerId?: ID | null; memberRole: MemberRole; agreedAmountCents?: number | null }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      if (!canWriteAll(me, "projects")) throw new ApiError(403, "Sem permissão para alterar a equipe.");
      if (!["cotacao", "ativo", "concluido"].includes(p.status)) throw new ApiError(409, "Este projeto está encerrado e não recebe pessoas novas. Reabra ou reative o projeto primeiro.");
      if (!!input.userId === !!input.freelancerId) throw new ApiError(422, "Escolha uma pessoa da equipe ou um freelancer.");
      const existing = db.projectMembers.find((m) => m.projectId === p.id && !m.deletedAt && ((input.userId && m.userId === input.userId) || (input.freelancerId && m.freelancerId === input.freelancerId)));
      if (existing?.active) throw new ApiError(409, "Essa pessoa já faz parte da equipe.");
      const prevAmount = existing?.agreedAmountCents ?? null;
      if (existing) {
        existing.active = true;
        existing.memberRole = input.memberRole;
        existing.agreedAmountCents = input.agreedAmountCents ?? existing.agreedAmountCents;
        touch(existing);
      } else {
        db.projectMembers.push({ ...baseFields(me.id), projectId: p.id, userId: input.userId ?? null, freelancerId: input.freelancerId ?? null, memberRole: input.memberRole, agreedAmountCents: input.freelancerId ? (input.agreedAmountCents ?? null) : null, active: true });
      }
      const fl = input.freelancerId ? db.freelancers.find((f) => f.id === input.freelancerId) : null;
      emit(db, me, { type: "project.member_added", entityType: "project", entityId: p.id, project: p, data: { userId: input.userId, freelancerId: input.freelancerId, role: input.memberRole, agreedAmountCents: input.agreedAmountCents ?? null } });
      notify(db, me, { userId: input.userId ?? fl?.userId, type: "atribuicao", title: "Você foi alocado em um projeto", project: p });
      const m = existing ?? db.projectMembers[db.projectMembers.length - 1];
      // RN-70 — entrou depois da conclusão: não fica sem pagamento em silêncio
      return { memberId: m.id, paymentSuggestion: afterCompletionTeamChange(db, me, p, m, prevAmount) };
    }),

  updateMember: (memberId: ID, patch: { memberRole?: MemberRole; agreedAmountCents?: number | null }) =>
    write((db, me) => {
      const m = db.projectMembers.find((x) => x.id === memberId);
      if (!m) throw new ApiError(404, "Membro não encontrado.");
      const p = assertProjectVisible(db, me, m.projectId);
      if (!canWriteAll(me, "projects")) throw new ApiError(403, "Sem permissão.");
      if ("agreedAmountCents" in patch) emitValueChange(db, me, "project_member", m.id, p, "agreedAmountCents", m.agreedAmountCents, patch.agreedAmountCents);
      const beforeAmount = m.agreedAmountCents;
      Object.assign(m, patch);
      touch(m);
      // RN-70 — valor alterado depois da conclusão acompanha o pagável ou sugere o pagamento
      return { memberId: m.id, paymentSuggestion: "agreedAmountCents" in patch ? afterCompletionTeamChange(db, me, p, m, beforeAmount) : null };
    }),

  /** RN-08 — sair do projeto remove acesso mas preserva registros. */
  removeMember: (memberId: ID) =>
    write((db, me) => {
      const m = db.projectMembers.find((x) => x.id === memberId);
      if (!m) throw new ApiError(404, "Membro não encontrado.");
      const p = assertProjectVisible(db, me, m.projectId);
      if (!canWriteAll(me, "projects")) throw new ApiError(403, "Sem permissão.");
      if (m.memberRole === "responsavel" && m.userId === p.ownerId) throw new ApiError(409, "Troque o responsável do projeto antes de removê-lo da equipe.");
      m.active = false;
      touch(m);
      // RN-101 — tarefas abertas da pessoa ficam sem responsável (o dono do projeto decide); ela e o responsável são avisados
      const open = db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt && t.statusKey !== "concluida" && ((m.userId && t.assigneeUserId === m.userId) || (m.freelancerId && t.assigneeFreelancerId === m.freelancerId)));
      open.forEach((t) => {
        t.assigneeUserId = null;
        t.assigneeFreelancerId = null;
        touch(t);
      });
      emit(db, me, { type: "project.member_removed", entityType: "project", entityId: p.id, project: p, data: { memberId, tasksUnassigned: open.length } });
      notifyMany(db, me, [m.userId ?? freelancerUserId(db, m.freelancerId)], { type: "atribuicao", title: `Você saiu do projeto ${p.code}`, body: p.title, project: p });
      if (open.length) notifyMany(db, me, [p.ownerId], { type: "atribuicao", title: `${open.length} tarefa(s) ficaram sem responsável`, body: `${memberDisplay(db, m).name} saiu da equipe de ${p.code}`, project: p });
      return { tasksUnassigned: open.length };
    }),

  /** `v_project_financials` */
  financials: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      if (!canSeeMoney(me)) throw new ApiError(403, "Seu perfil não tem acesso ao financeiro.");
      return computeFinancials(db, p.id);
    }),
};

export function computeFinancials(db: Database, projectId: ID): ProjectFinancials {
  const p = db.projects.find((x) => x.id === projectId)!;
  const recs = db.receivables.filter((r) => r.projectId === projectId && !r.deletedAt && r.status !== "cancelado");
  const pays = db.payables.filter((r) => r.projectId === projectId && !r.deletedAt);
  const contracted = p.contractedAmountCents ?? 0;
  const freelancerCommitted = db.projectMembers
    .filter((m) => m.projectId === projectId && m.freelancerId && m.agreedAmountCents && m.active && !m.deletedAt)
    .reduce((a, m) => a + (m.agreedAmountCents ?? 0), 0);
  const freelancerCost = Math.max(freelancerCommitted, pays.filter((x) => x.kind === "freelancer").reduce((a, x) => a + (x.invoicedAmountCents ?? x.agreedAmountCents), 0));
  const otherCost = pays.filter((x) => x.kind === "despesa_projeto").reduce((a, x) => a + x.agreedAmountCents, 0);
  const invoiced = recs.filter((r) => r.issuedAt).reduce((a, r) => a + r.amountCents, 0);
  const received = recs.filter((r) => r.status === "recebido").reduce((a, r) => a + r.amountCents, 0);
  const expected = recs.reduce((a, r) => a + r.amountCents, 0);
  // RN-65 — receita = contratado + adicionais (RN-14); impostos (RN-15) saem da margem
  const parcels = recs.filter((r) => r.kind !== "adicional");
  const additional = recs.filter((r) => r.kind === "adicional").reduce((a, r) => a + r.amountCents, 0);
  const additionalTax = recs.filter((r) => r.kind === "adicional").reduce((a, r) => a + r.taxCents, 0);
  const contractTax = parcels.length ? parcels.reduce((a, r) => a + r.taxCents, 0) : taxOf(db, contracted);
  const revenue = contracted + additional;
  const tax = contractTax + additionalTax;
  const margin = revenue - tax - freelancerCost - otherCost;
  return {
    projectId,
    contractedCents: contracted,
    expectedCents: expected,
    invoicedCents: invoiced,
    receivedCents: received,
    toReceiveCents: expected - received,
    freelancerCostCents: freelancerCost,
    otherCostCents: otherCost,
    additionalCents: additional,
    revenueCents: revenue,
    taxCents: tax,
    marginCents: margin,
    marginPct: revenue ? margin / revenue : null,
  };
}

/**
 * RN-55 — trocar o responsável coloca o novo na equipe como `responsavel` (criando ou reativando o membro)
 * e rebaixa o anterior para `apoio` (continua na equipe e vendo o projeto).
 */
function syncOwnerMember(db: Database, me: User, p: Project, previousOwnerId: ID) {
  const members = db.projectMembers.filter((m) => m.projectId === p.id && !m.deletedAt);
  const prev = members.find((m) => m.userId === previousOwnerId && m.memberRole === "responsavel");
  if (prev) {
    prev.memberRole = "apoio";
    touch(prev);
  }
  const next = members.find((m) => m.userId === p.ownerId);
  if (next) {
    next.active = true;
    next.memberRole = "responsavel";
    touch(next);
  } else {
    db.projectMembers.push({ ...baseFields(me.id), projectId: p.id, userId: p.ownerId, freelancerId: null, memberRole: "responsavel", agreedAmountCents: null, active: true });
  }
  emit(db, me, { type: "project.owner_changed", entityType: "project", entityId: p.id, project: p, data: { from: previousOwnerId, to: p.ownerId } });
}

/** Registros antigos sem `statusBeforeArchive`: deduz pelo último evento de encerramento. */
function legacyStatusBeforeArchive(db: Database, p: Project): Exclude<Project["status"], "arquivado"> {
  if (p.completedAt) return "concluido";
  const last = db.events
    .filter((e) => e.projectId === p.id && (e.type === "project.cancelled" || e.type === "project.lost"))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return last?.type === "project.cancelled" ? "cancelado" : "perdido";
}

/**
 * RN-72 — quem da equipe recebe a tarefa-modelo: o papel do modelo (ou o padrão da etapa) resolve o primeiro
 * membro ativo com esse papel (interno ou freelancer); sem ninguém, vai para o responsável do projeto.
 */
export function resolveTemplateAssignee(db: Database, p: Project, role: MemberRole): { userId: ID | null; freelancerId: ID | null } {
  const m = db.projectMembers
    .filter((x) => x.projectId === p.id && x.active && !x.deletedAt && x.memberRole === role)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (m && role !== "responsavel") return { userId: m.userId, freelancerId: m.userId ? null : m.freelancerId };
  return { userId: p.ownerId, freelancerId: null };
}

/**
 * RF-M4-05 / RN-72 — gera tarefas do modelo do tipo de projeto, por etapa, distribuídas por papel da equipe.
 * Datas: em sequência a partir de hoje; com prazo do projeto no futuro, as durações são distribuídas
 * proporcionalmente até o prazo (a última tarefa vence no prazo) e o evento avisa se o modelo excedia o prazo.
 */
export function generateTasksFromTemplate(db: Database, me: User | null, p: Project) {
  const tpl = db.projectTypeTaskTemplates.filter((t) => t.projectTypeId === p.projectTypeId && !t.deletedAt).sort((a, b) => a.order - b.order);
  if (!tpl.length) return;
  const DAY = 86_400_000;
  const start = Date.now();
  const totalDays = tpl.reduce((a, t) => a + Math.max(0, t.defaultDurationDays), 0);
  const due = p.dueAt ? new Date(p.dueAt).getTime() : null;
  const window = due && due > start ? due - start : null;
  const exceedsDeadline = !!window && totalDays * DAY > window;
  const msPerDay = window && totalDays > 0 ? window / totalDays : DAY;
  let cursor = start;
  tpl.forEach((t, i) => {
    const from = cursor;
    cursor += Math.max(0, t.defaultDurationDays) * msPerDay;
    const to = window && i === tpl.length - 1 ? due! : cursor;
    const who = resolveTemplateAssignee(db, p, t.defaultRole ?? STAGE_DEFAULT_ROLE[t.stageKey]);
    const task: Task = {
      ...baseFields(me?.id ?? null),
      projectId: p.id,
      module: "projeto",
      parentTaskId: null,
      stageKey: t.stageKey,
      title: t.title,
      description: null,
      assigneeUserId: who.userId,
      assigneeFreelancerId: who.freelancerId,
      statusKey: "a_fazer",
      priorityKey: "media",
      startAt: new Date(from).toISOString(),
      dueAt: new Date(to).toISOString(),
      estimateMinutes: null,
      position: i * 1000,
      sprintId: null,
      completedAt: null,
      area: null,
    };
    db.tasks.push(task);
    const userId = who.userId ?? freelancerUserId(db, who.freelancerId);
    if (userId !== p.ownerId) notify(db, me, { userId, type: "atribuicao", title: `Nova tarefa: ${t.title}`, project: p, entityType: "task", entityId: task.id });
  });
  emit(db, me, { type: "project.tasks_generated", entityType: "project", entityId: p.id, project: p, data: { count: tpl.length, exceedsDeadline, templateDays: totalDays } });
}

/** RF-M3-03 / RN-72 — tarefas da cotação para o responsável (diagnóstico, proposta, follow-up). */
export function generateQuoteTasks(db: Database, me: User, p: Project) {
  const now = Date.now();
  QUOTE_TASK_TEMPLATE.forEach((t, i) => {
    db.tasks.push({
      ...baseFields(me.id),
      projectId: p.id,
      module: "projeto",
      parentTaskId: null,
      stageKey: t.stageKey,
      title: t.title,
      description: null,
      assigneeUserId: p.ownerId,
      assigneeFreelancerId: null,
      statusKey: "a_fazer",
      priorityKey: "media",
      startAt: new Date(now).toISOString(),
      dueAt: new Date(now + t.dueInDays * 86_400_000).toISOString(),
      estimateMinutes: null,
      position: i * 1000,
      sprintId: null,
      completedAt: null,
      area: null,
    });
  });
}

/** RN-72 — ao aprovar, as tarefas da cotação ainda abertas são encerradas (a proposta foi aceita). */
export function closeQuoteTasks(db: Database, p: Project) {
  const quoteStages = new Set<string>(QUOTE_TASK_TEMPLATE.map((t) => t.stageKey));
  const now = nowIso();
  const open = db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt && t.statusKey !== "concluida" && !!t.stageKey && quoteStages.has(t.stageKey) && !t.parentTaskId);
  open.forEach((t) => {
    t.statusKey = "concluida";
    t.completedAt = now;
    t.updatedAt = now;
  });
  return open.length;
}
