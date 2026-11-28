import { FIRST_PROJECT_STAGE } from "../reference";
import { baseFields, nowIso } from "../db";
import type { Database, ID, Project, Proposal, User } from "../types";
import { ApiError, assertProjectVisible, emit, taxOf, emitValueChange, read, requireAccess, touch, write } from "./_core";
import { notifyMany, projectAudience } from "./audience";
import { createClientLink, resolveRecipients } from "./client-links";
import { closeQuoteTasks, generateTasksFromTemplate } from "./projects";
import { installmentDue } from "./finance-rules";
import { canSeeMoney } from "@/lib/permissions";

/** Guarda comum das ações comerciais sobre propostas (seção 9: comercial = T e acesso a valores). */
function validateProposal(input: { amountCents: number; installments: InstallmentInput[] }) {
  const errors: Record<string, string> = {};
  if (!(input.amountCents > 0)) errors.amountCents = "Informe o valor da proposta";
  if (!input.installments.length) errors.installments = "Informe ao menos uma parcela";
  const sum = input.installments.reduce((a, i) => a + i.amountCents, 0);
  if (input.installments.length && sum !== input.amountCents) errors.installments = "A soma das parcelas deve ser igual ao valor da proposta";
  if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
}

/**
 * RN-01 — aprovação em uma transação: proposta aprovada, projeto ativo, recebíveis e tarefas.
 * Mesmo caminho para a aprovação interna e para a do cliente pelo link público (RN-51), `me = null`.
 */
export function approveProposalTx(db: Database, me: User | null, prop: Proposal, via: { kind: "interno" | "link_cliente"; respondentName?: string | null; shareLinkId?: ID | null }) {
  const p = db.projects.find((x) => x.id === prop.projectId && !x.deletedAt);
  if (!p) throw new ApiError(404, "Projeto não encontrado.");
  if (p.status !== "cotacao") throw new ApiError(409, "Este projeto não está em cotação.");
  if (prop.status !== "enviada") throw new ApiError(409, "Envie a proposta antes de aprová-la.");
  const now = nowIso();
  prop.status = "aprovada";
  prop.approvedAt = now;
  touch(prop);
  db.proposals.filter((x) => x.projectId === p.id && x.id !== prop.id && x.status !== "recusada").forEach((x) => (x.status = "recusada"));
  p.status = "ativo";
  p.quoteStageKey = null;
  p.projectStageKey = FIRST_PROJECT_STAGE;
  p.approvedAt = now;
  p.startedAt = now;
  p.contractedAmountCents = prop.amountCents;
  touch(p);
  const insts = db.proposalInstallments.filter((i) => i.proposalId === prop.id && !i.deletedAt).sort((a, b) => a.number - b.number);
  insts.forEach((i) => {
    // RN-45 — sem data na parcela: gatilho + prazo do cliente (regra aplicada fica no lançamento)
    const due = installmentDue(db, p, i, now);
    db.receivables.push({
      ...baseFields(me?.id ?? null),
      projectId: p.id,
      clientId: p.clientId,
      proposalInstallmentId: i.id,
      description: insts.length > 1 ? `Parcela ${i.number}/${insts.length} — ${i.dueRule ?? "conforme proposta"}` : `Parcela única — ${i.dueRule ?? "conforme proposta"}`,
      amountCents: i.amountCents,
      taxCents: taxOf(db, i.amountCents),
      kind: "parcela",
      collectionNote: null,
      expectedAt: due.expectedAt,
      dueBasis: due.basis,
      invoiceNumber: null,
      invoiceFileId: null,
      issuedAt: null,
      receivedAt: null,
      status: "previsto",
    });
  });
  closeQuoteTasks(db, p);
  generateTasksFromTemplate(db, me, p);
  emit(db, me, {
    type: "proposal.approved",
    entityType: "proposal",
    entityId: prop.id,
    project: p,
    data: { version: prop.version, amountCents: prop.amountCents, receivables: insts.length, via: via.kind, respondentName: via.respondentName ?? null, shareLinkId: via.shareLinkId ?? null },
  });
  const byClient = via.kind === "link_cliente";
  const title = byClient ? "Cliente aprovou a proposta — projeto ativo" : "Proposta aprovada — projeto ativo";
  const body = byClient ? `${via.respondentName ?? "Cliente"} aprovou a proposta v${prop.version} pelo link` : undefined;
  // Responsável e equipe (RN-53); Financeiro e Gestão ativos para preparar o faturamento.
  notifyMany(db, me, projectAudience(db, p), { type: byClient ? "cliente" : "projeto", title, body, project: p });
  notifyMany(
    db,
    me,
    db.users.filter((u) => ["financeiro", "gestao"].includes(u.role) && u.status === "ativo").map((u) => u.id),
    { type: "aprovacao", title, body, project: p },
  );
  return p;
}

/** RN-11 — marca como enviada (data do sistema) e move o funil. */
function markSent(db: Database, me: User, prop: Proposal, p: Project) {
  const now = nowIso();
  prop.status = "enviada";
  prop.sentAt = now;
  touch(prop);
  if (!p.quoteSentAt) p.quoteSentAt = now;
  if (p.quoteStageKey !== "negociacao") {
    emit(db, me, { type: "project.quote_stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.quoteStageKey, to: "enviada" } });
    p.quoteStageKey = "enviada";
  }
  touch(p);
  db.proposals.filter((x) => x.projectId === p.id && x.id !== prop.id && x.status === "enviada").forEach((x) => (x.status = "recusada"));
}

export interface InstallmentInput {
  amountCents: number;
  dueRule: string | null;
  dueAt: string | null;
}

/** RN-30 — criar, editar, enviar, aprovar e recusar propostas: Comercial "T" e acesso a valores (Financeiro só consulta). */
function requireProposalWrite(me: User) {
  requireAccess(me, "commercial", "all", "Seu perfil só consulta propostas. Peça ao Comercial para fazer essa alteração.");
  if (!canSeeMoney(me)) throw new ApiError(403, "Seu perfil não tem acesso a valores e propostas.");
}

export const proposalsApi = {
  listByProject: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      if (!canSeeMoney(me)) throw new ApiError(403, "Seu perfil não tem acesso a propostas.");
      return db.proposals
        .filter((pr) => pr.projectId === p.id && !pr.deletedAt)
        .sort((a, b) => b.version - a.version)
        .map((pr) => ({
          ...pr,
          installments: db.proposalInstallments.filter((i) => i.proposalId === pr.id && !i.deletedAt).sort((a, b) => a.number - b.number),
          file: db.files.find((f) => f.id === pr.fileId) ?? null,
        }));
    }),

  /** RF-M3-04 — nova versão (rascunho). */
  create: (projectId: ID, input: { amountCents: number; paymentTermsNote?: string; installments: InstallmentInput[]; fileId?: ID | null }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      requireProposalWrite(me);
      if (p.status !== "cotacao") throw new ApiError(409, "Só é possível criar propostas para projetos em cotação.");
      validateProposal(input);
      const version = Math.max(0, ...db.proposals.filter((x) => x.projectId === p.id).map((x) => x.version)) + 1;
      const prop: Proposal = { ...baseFields(me.id), projectId: p.id, version, amountCents: input.amountCents, paymentTermsNote: input.paymentTermsNote?.trim() || db.clients.find((c) => c.id === p.clientId)?.paymentTermsNote || null, status: "rascunho", sentAt: null, approvedAt: null, fileId: input.fileId ?? null };
      db.proposals.push(prop);
      input.installments.forEach((i, n) => db.proposalInstallments.push({ ...baseFields(me.id), proposalId: prop.id, number: n + 1, amountCents: i.amountCents, dueRule: i.dueRule, dueAt: i.dueAt }));
      if (p.quoteStageKey === "entrada" || p.quoteStageKey === "diagnostico") {
        emit(db, me, { type: "project.quote_stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.quoteStageKey, to: "elaboracao" } });
        p.quoteStageKey = "elaboracao";
      }
      emit(db, me, { type: "proposal.created", entityType: "proposal", entityId: prop.id, project: p, data: { version, amountCents: input.amountCents } });
      return prop;
    }),

  update: (proposalId: ID, input: { amountCents: number; paymentTermsNote?: string; installments: InstallmentInput[]; fileId?: ID | null }) =>
    write((db, me) => {
      const prop = db.proposals.find((x) => x.id === proposalId);
      if (!prop) throw new ApiError(404, "Proposta não encontrada.");
      const p = assertProjectVisible(db, me, prop.projectId);
      requireProposalWrite(me);
      if (p.status !== "cotacao") throw new ApiError(409, "Só é possível editar propostas de projetos em cotação.");
      if (prop.status !== "rascunho") throw new ApiError(409, "Só rascunhos podem ser editados. Crie uma nova versão.");
      validateProposal(input);
      emitValueChange(db, me, "proposal", prop.id, p, "amountCents", prop.amountCents, input.amountCents);
      prop.amountCents = input.amountCents;
      prop.paymentTermsNote = input.paymentTermsNote ?? null;
      if (input.fileId !== undefined) prop.fileId = input.fileId;
      touch(prop);
      db.proposalInstallments.filter((i) => i.proposalId === prop.id).forEach((i) => (i.deletedAt = nowIso()));
      input.installments.forEach((i, n) => db.proposalInstallments.push({ ...baseFields(me.id), proposalId: prop.id, number: n + 1, amountCents: i.amountCents, dueRule: i.dueRule, dueAt: i.dueAt }));
      return prop;
    }),

  /**
   * RN-11 / RN-51 — envia a proposta ao cliente: marca como enviada, cria o link público (30 dias, revogável) e
   * enfileira o e-mail transacional aos contatos escolhidos (padrão: contato de cobrança / decisor do cliente).
   */
  send: (proposalId: ID, opts: { contactIds?: ID[]; message?: string | null } = {}) =>
    write((db, me) => {
      const prop = db.proposals.find((x) => x.id === proposalId && !x.deletedAt);
      if (!prop) throw new ApiError(404, "Proposta não encontrada.");
      const p = assertProjectVisible(db, me, prop.projectId);
      requireProposalWrite(me);
      if (p.status !== "cotacao") throw new ApiError(409, "Só é possível enviar propostas de projetos em cotação.");
      if (prop.status !== "rascunho") throw new ApiError(409, "Esta proposta já foi enviada. Para reenviar o link, use \"Reenviar\" em Envios ao cliente.");
      const recipients = resolveRecipients(db, p, opts.contactIds);
      markSent(db, me, prop, p);
      const link = createClientLink(db, me, { purpose: "proposta", project: p, targetId: prop.id, recipients, message: opts.message ?? null, fileVersionIds: [] });
      emit(db, me, { type: "proposal.sent", entityType: "proposal", entityId: prop.id, project: p, data: { version: prop.version, amountCents: prop.amountCents, recipients: link.recipients, shareLinkId: link.id } });
      return prop;
    }),

  /** RN-01 — aprovação interna: uma transação, projeto vira ativo, recebíveis e tarefas criados. */
  approve: (proposalId: ID) =>
    write((db, me) => {
      const prop = db.proposals.find((x) => x.id === proposalId && !x.deletedAt);
      if (!prop) throw new ApiError(404, "Proposta não encontrada.");
      assertProjectVisible(db, me, prop.projectId);
      requireProposalWrite(me);
      const project = approveProposalTx(db, me, prop, { kind: "interno" });
      return { proposal: prop, project };
    }),

  /** Registra a recusa do cliente (motivo opcional). Só proposta `enviada` de projeto em cotação; rascunho se descarta (RN-71). */
  reject: (proposalId: ID, reason?: string | null) =>
    write((db, me) => {
      const prop = db.proposals.find((x) => x.id === proposalId && !x.deletedAt);
      if (!prop) throw new ApiError(404, "Proposta não encontrada.");
      const p = assertProjectVisible(db, me, prop.projectId);
      requireProposalWrite(me);
      if (p.status !== "cotacao") throw new ApiError(409, "Só é possível registrar recusa em projetos em cotação. Para desfazer uma aprovação, use \"Desfazer aprovação…\" no projeto.");
      if (prop.status !== "enviada") throw new ApiError(409, prop.status === "rascunho" ? "Rascunho não é recusado: descarte-o." : "Só propostas enviadas podem ter a recusa registrada.");
      prop.status = "recusada";
      touch(prop);
      if (p.quoteStageKey === "enviada") p.quoteStageKey = "negociacao";
      emit(db, me, { type: "proposal.rejected", entityType: "proposal", entityId: prop.id, project: p, data: { version: prop.version, reason: reason?.trim() || null } });
      return prop;
    }),

  /** RN-71 — descarta um rascunho (soft delete com as parcelas). A numeração de versões não é reaproveitada. */
  discard: (proposalId: ID) =>
    write((db, me) => {
      const prop = db.proposals.find((x) => x.id === proposalId && !x.deletedAt);
      if (!prop) throw new ApiError(404, "Proposta não encontrada.");
      const p = assertProjectVisible(db, me, prop.projectId);
      requireProposalWrite(me);
      if (prop.status !== "rascunho") throw new ApiError(409, "Só rascunhos podem ser descartados. Propostas enviadas ficam no histórico.");
      const now = nowIso();
      prop.deletedAt = now;
      touch(prop);
      db.proposalInstallments.filter((i) => i.proposalId === prop.id && !i.deletedAt).forEach((i) => (i.deletedAt = now));
      emit(db, me, { type: "proposal.discarded", entityType: "proposal", entityId: prop.id, project: p, data: { version: prop.version, amountCents: prop.amountCents } });
      return prop;
    }),
};
