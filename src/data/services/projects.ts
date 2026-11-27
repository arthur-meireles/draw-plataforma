import { baseFields, nowIso } from "../db";
import { FIRST_PROJECT_STAGE, PROJECT_STAGES } from "../reference";
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
import { canSeeMoney, canWriteAll } from "@/lib/permissions";
import { settleCompletionPayables, type CompletionDecision } from "./payables-extra";

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
  billingStatus: "sem_faturamento" | "a_faturar" | "parcial" | "faturado" | "recebido";
}

const nextCode = (db: Database, prefix: string) => {
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
    if (f.memberUserId && !db.projectMembers.some((m) => m.projectId === p.id && m.active && (m.userId === f.memberUserId || p.ownerId === f.memberUserId))) return false;
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
      const type = db.projectTypes.find((t) => t.id === input.projectTypeId);
      if (!type) throw new ApiError(422, "Escolha um tipo de projeto.", { projectTypeId: "Escolha um tipo de projeto" });
      if (!db.clients.some((c) => c.id === input.clientId)) throw new ApiError(422, "Escolha um cliente.", { clientId: "Escolha um cliente" });
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
      };
      db.projects.push(p);
      db.projectMembers.push({ ...baseFields(me.id), projectId: p.id, userId: input.ownerId, freelancerId: null, memberRole: "responsavel", agreedAmountCents: null, active: true });
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
      const errors: Record<string, string> = {};
      if (!input.clientId) errors.clientId = "Escolha um cliente";
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
      return p;
    }),

  update: (id: ID, patch: Partial<Pick<Project, "title" | "briefing" | "priorityKey" | "ownerId" | "dueAt" | "estimatedEndAt" | "billingContactId" | "clientId" | "contractedAmountCents" | "size" | "paymentCondition">>) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (!canWriteAll(me, "projects") && !(me.role === "operacao")) throw new ApiError(403, "Sem permissão para editar o projeto.");
      if (patch.clientId && patch.clientId !== p.clientId) {
        const issued = db.receivables.some((r) => r.projectId === p.id && r.issuedAt);
        if (issued) throw new ApiError(409, "Este projeto já tem nota fiscal emitida e não pode trocar de cliente (RN-12).");
      }
      if ("contractedAmountCents" in patch) {
        if (!canSeeMoney(me)) throw new ApiError(403, "Sem permissão para alterar valores.");
        emitValueChange(db, me, "project", p.id, p, "contractedAmountCents", p.contractedAmountCents, patch.contractedAmountCents);
      }
      const before = { ...p };
      Object.assign(p, patch);
      touch(p);
      const changed = Object.keys(patch).filter((k) => (before as unknown as Record<string, unknown>)[k] !== (p as unknown as Record<string, unknown>)[k]);
      if (changed.length) emit(db, me, { type: "project.updated", entityType: "project", entityId: p.id, project: p, data: { fields: changed } });
      if (patch.ownerId && patch.ownerId !== before.ownerId) notify(db, me, { userId: patch.ownerId, type: "atribuicao", title: "Você agora é responsável pelo projeto", project: p });
      return p;
    }),

  /** Arrastar no kanban: muda etapa e/ou posição (RF-M4-07). */
  move: (id: ID, input: { stageKey: ProjectStageKey | QuoteStageKey; position: number }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
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
        if (to !== p.projectStageKey) {
          emit(db, me, { type: "project.stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.projectStageKey, to } });
          p.projectStageKey = to;
          const stage = PROJECT_STAGES.find((s) => s.key === to);
          if (stage?.category === "waiting") {
            db.approvals.push({ ...baseFields(me.id), projectId: p.id, stageKey: to, requestedFrom: db.clientContacts.find((c) => c.id === p.billingContactId)?.name ?? "Cliente", decision: "pendente", reason: null, decidedBy: null, decidedAt: null });
          }
          db.projectMembers
            .filter((m) => m.projectId === p.id && m.active && m.userId)
            .forEach((m) => notify(db, me, { userId: m.userId, type: "aprovacao", title: `Projeto movido para ${stage?.label}`, project: p }));
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
      if (p.status !== "ativo") throw new ApiError(409, "Só projetos ativos podem ser pausados.");
      if (!reason.trim()) throw new ApiError(422, "Informe por que o projeto está parado.", { reason: "Informe o motivo" });
      p.pausedAt = nowIso();
      p.pausedReason = reason.trim();
      touch(p);
      emit(db, me, { type: "project.paused", entityType: "project", entityId: p.id, project: p, data: { reason: p.pausedReason } });
      return p;
    }),

  resume: (id: ID) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (!p.pausedAt) throw new ApiError(409, "O projeto não está pausado.");
      p.pausedAt = null;
      p.pausedReason = null;
      touch(p);
      emit(db, me, { type: "project.resumed", entityType: "project", entityId: p.id, project: p });
      return p;
    }),

  /** RF-M3-05 — perder exige motivo. */
  markLost: (id: ID, reason: string) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (!reason.trim()) throw new ApiError(422, "Informe o motivo da perda.", { reason: "Informe o motivo da perda" });
      if (p.status !== "cotacao") throw new ApiError(409, "Só cotações podem ser marcadas como perdidas.");
      p.status = "perdido";
      p.quoteStageKey = "perdida";
      p.lostReason = reason.trim();
      touch(p);
      db.proposals.filter((pr) => pr.projectId === p.id && pr.status === "enviada").forEach((pr) => (pr.status = "recusada"));
      emit(db, me, { type: "project.lost", entityType: "project", entityId: p.id, project: p, data: { reason } });
      return p;
    }),

  reopenQuote: (id: ID) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (p.status !== "perdido") throw new ApiError(409, "Só cotações perdidas podem ser reabertas.");
      p.status = "cotacao";
      p.quoteStageKey = "negociacao";
      p.lostReason = null;
      touch(p);
      emit(db, me, { type: "project.reopened", entityType: "project", entityId: p.id, project: p });
      return p;
    }),

  /** RF-M4-12 / RN-03 — concluir gera contas a pagar, share links e e-mails. */
  complete: (id: ID, decisions: CompletionDecision[] = []) =>
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
      touch(p);
      emit(db, me, { type: "project.completed", entityType: "project", entityId: p.id, project: p, data: { payablesCreated: created.length } });
      return { project: p, payablesCreated: created.length };
    }),

  /** RN-07 — arquivar não apaga. */
  archive: (id: ID) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (!["concluido", "perdido", "cancelado"].includes(p.status)) throw new ApiError(409, "Só projetos concluídos, perdidos ou cancelados podem ser arquivados.");
      p.status = "arquivado";
      p.archivedAt = nowIso();
      touch(p);
      emit(db, me, { type: "project.archived", entityType: "project", entityId: p.id, project: p });
      return p;
    }),

  unarchive: (id: ID) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (p.status !== "arquivado") throw new ApiError(409, "Projeto não está arquivado.");
      p.status = p.completedAt ? "concluido" : "perdido";
      p.archivedAt = null;
      touch(p);
      emit(db, me, { type: "project.unarchived", entityType: "project", entityId: p.id, project: p });
      return p;
    }),

  cancel: (id: ID, reason: string) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, id);
      if (!canWriteAll(me, "projects")) throw new ApiError(403, "Sem permissão.");
      if (!reason.trim()) throw new ApiError(422, "Informe o motivo do cancelamento.", { reason: "Informe o motivo" });
      p.status = "cancelado";
      p.lostReason = reason;
      touch(p);
      db.receivables.filter((r) => r.projectId === p.id && r.status === "previsto").forEach((r) => (r.status = "cancelado"));
      emit(db, me, { type: "project.cancelled", entityType: "project", entityId: p.id, project: p, data: { reason } });
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
      if (!!input.userId === !!input.freelancerId) throw new ApiError(422, "Escolha uma pessoa da equipe ou um freelancer.");
      const existing = db.projectMembers.find((m) => m.projectId === p.id && !m.deletedAt && ((input.userId && m.userId === input.userId) || (input.freelancerId && m.freelancerId === input.freelancerId)));
      if (existing?.active) throw new ApiError(409, "Essa pessoa já faz parte da equipe.");
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
    }),

  updateMember: (memberId: ID, patch: { memberRole?: MemberRole; agreedAmountCents?: number | null }) =>
    write((db, me) => {
      const m = db.projectMembers.find((x) => x.id === memberId);
      if (!m) throw new ApiError(404, "Membro não encontrado.");
      const p = assertProjectVisible(db, me, m.projectId);
      if (!canWriteAll(me, "projects")) throw new ApiError(403, "Sem permissão.");
      if ("agreedAmountCents" in patch) emitValueChange(db, me, "project_member", m.id, p, "agreedAmountCents", m.agreedAmountCents, patch.agreedAmountCents);
      Object.assign(m, patch);
      touch(m);
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
      emit(db, me, { type: "project.member_removed", entityType: "project", entityId: p.id, project: p, data: { memberId } });
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
    .filter((m) => m.projectId === projectId && m.freelancerId && m.agreedAmountCents && !m.deletedAt)
    .reduce((a, m) => a + (m.agreedAmountCents ?? 0), 0);
  const freelancerCost = Math.max(freelancerCommitted, pays.filter((x) => x.kind === "freelancer").reduce((a, x) => a + (x.invoicedAmountCents ?? x.agreedAmountCents), 0));
  const otherCost = pays.filter((x) => x.kind === "despesa_projeto").reduce((a, x) => a + x.agreedAmountCents, 0);
  const invoiced = recs.filter((r) => r.issuedAt).reduce((a, r) => a + r.amountCents, 0);
  const received = recs.filter((r) => r.status === "recebido").reduce((a, r) => a + r.amountCents, 0);
  const expected = recs.reduce((a, r) => a + r.amountCents, 0);
  const margin = contracted - freelancerCost - otherCost;
  return {
    projectId,
    contractedCents: contracted,
    expectedCents: expected,
    invoicedCents: invoiced,
    receivedCents: received,
    toReceiveCents: expected - received,
    freelancerCostCents: freelancerCost,
    otherCostCents: otherCost,
    marginCents: margin,
    marginPct: contracted ? margin / contracted : null,
  };
}

/** RF-M4-05 — gera tarefas do modelo do tipo de projeto, por etapa. */
export function generateTasksFromTemplate(db: Database, me: User, p: Project) {
  const tpl = db.projectTypeTaskTemplates.filter((t) => t.projectTypeId === p.projectTypeId && !t.deletedAt).sort((a, b) => a.order - b.order);
  let cursor = Date.now();
  tpl.forEach((t, i) => {
    const start = new Date(cursor);
    cursor += t.defaultDurationDays * 86_400_000;
    const task: Task = {
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
      startAt: start.toISOString(),
      dueAt: new Date(cursor).toISOString(),
      estimateMinutes: null,
      position: i * 1000,
      sprintId: null,
      completedAt: null,
      area: null,
    };
    db.tasks.push(task);
  });
  if (tpl.length) emit(db, me, { type: "project.tasks_generated", entityType: "project", entityId: p.id, project: p, data: { count: tpl.length } });
}
