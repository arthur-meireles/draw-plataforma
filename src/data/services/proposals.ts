import { FIRST_PROJECT_STAGE } from "../reference";
import { baseFields, nowIso } from "../db";
import type { ID, Proposal, User } from "../types";
import { ApiError, assertProjectVisible, emit, taxOf, emitValueChange, notify, read, requireAccess, touch, write } from "./_core";
import { generateTasksFromTemplate } from "./projects";
import { canSeeMoney } from "@/lib/permissions";

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
      const errors: Record<string, string> = {};
      if (input.amountCents <= 0) errors.amountCents = "Informe o valor da proposta";
      if (!input.installments.length) errors.installments = "Informe ao menos uma parcela";
      const sum = input.installments.reduce((a, i) => a + i.amountCents, 0);
      if (input.installments.length && sum !== input.amountCents) errors.installments = "A soma das parcelas deve ser igual ao valor da proposta";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const version = Math.max(0, ...db.proposals.filter((x) => x.projectId === p.id).map((x) => x.version)) + 1;
      const prop: Proposal = { ...baseFields(me.id), projectId: p.id, version, amountCents: input.amountCents, paymentTermsNote: input.paymentTermsNote ?? null, status: "rascunho", sentAt: null, approvedAt: null, fileId: input.fileId ?? null };
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
      if (prop.status !== "rascunho") throw new ApiError(409, "Só rascunhos podem ser editados. Crie uma nova versão.");
      const sum = input.installments.reduce((a, i) => a + i.amountCents, 0);
      if (sum !== input.amountCents) throw new ApiError(422, "A soma das parcelas deve ser igual ao valor da proposta", { installments: "A soma das parcelas deve ser igual ao valor da proposta" });
      emitValueChange(db, me, "proposal", prop.id, p, "amountCents", prop.amountCents, input.amountCents);
      prop.amountCents = input.amountCents;
      prop.paymentTermsNote = input.paymentTermsNote ?? null;
      if (input.fileId !== undefined) prop.fileId = input.fileId;
      touch(prop);
      db.proposalInstallments.filter((i) => i.proposalId === prop.id).forEach((i) => (i.deletedAt = nowIso()));
      input.installments.forEach((i, n) => db.proposalInstallments.push({ ...baseFields(me.id), proposalId: prop.id, number: n + 1, amountCents: i.amountCents, dueRule: i.dueRule, dueAt: i.dueAt }));
      return prop;
    }),

  /** RN-11 — data de envio registrada pelo sistema. */
  send: (proposalId: ID) =>
    write((db, me) => {
      const prop = db.proposals.find((x) => x.id === proposalId);
      if (!prop) throw new ApiError(404, "Proposta não encontrada.");
      const p = assertProjectVisible(db, me, prop.projectId);
      requireProposalWrite(me);
      if (prop.status !== "rascunho") throw new ApiError(409, "Esta proposta já foi enviada.");
      const now = nowIso();
      prop.status = "enviada";
      prop.sentAt = now;
      touch(prop);
      if (!p.quoteSentAt) p.quoteSentAt = now;
      if (p.quoteStageKey !== "negociacao") {
        emit(db, me, { type: "project.quote_stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.quoteStageKey, to: "enviada" } });
        p.quoteStageKey = "enviada";
      }
      db.proposals.filter((x) => x.projectId === p.id && x.id !== prop.id && x.status === "enviada").forEach((x) => (x.status = "recusada"));
      emit(db, me, { type: "proposal.sent", entityType: "proposal", entityId: prop.id, project: p, data: { version: prop.version, amountCents: prop.amountCents } });
      return prop;
    }),

  /** RN-01 — aprovação: uma transação, projeto vira ativo, recebíveis e tarefas criados. */
  approve: (proposalId: ID) =>
    write((db, me) => {
      const prop = db.proposals.find((x) => x.id === proposalId);
      if (!prop) throw new ApiError(404, "Proposta não encontrada.");
      const p = assertProjectVisible(db, me, prop.projectId);
      requireProposalWrite(me);
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
        const expected = i.dueAt ?? (i.dueRule === "Na aprovação" ? new Date(Date.now() + 5 * 86_400_000).toISOString() : (p.dueAt ?? new Date(Date.now() + 45 * 86_400_000).toISOString()));
        db.receivables.push({
          ...baseFields(me.id),
          projectId: p.id,
          clientId: p.clientId,
          proposalInstallmentId: i.id,
          description: insts.length > 1 ? `Parcela ${i.number}/${insts.length} — ${i.dueRule ?? "conforme proposta"}` : `Parcela única — ${i.dueRule ?? "conforme proposta"}`,
          amountCents: i.amountCents,
          taxCents: taxOf(db, i.amountCents),
          kind: "parcela",
          collectionNote: null,
          expectedAt: expected,
          invoiceNumber: null,
          invoiceFileId: null,
          issuedAt: null,
          receivedAt: null,
          status: "previsto",
        });
      });
      generateTasksFromTemplate(db, me, p);
      emit(db, me, { type: "proposal.approved", entityType: "proposal", entityId: prop.id, project: p, data: { version: prop.version, amountCents: prop.amountCents, receivables: insts.length } });
      db.users.filter((u) => ["financeiro", "gestao"].includes(u.role) && u.status === "ativo").forEach((u) => notify(db, me, { userId: u.id, type: "aprovacao", title: "Proposta aprovada — projeto ativo", project: p }));
      return { proposal: prop, project: p };
    }),

  reject: (proposalId: ID) =>
    write((db, me) => {
      const prop = db.proposals.find((x) => x.id === proposalId);
      if (!prop) throw new ApiError(404, "Proposta não encontrada.");
      const p = assertProjectVisible(db, me, prop.projectId);
      requireProposalWrite(me);
      prop.status = "recusada";
      touch(prop);
      if (p.quoteStageKey === "enviada") p.quoteStageKey = "negociacao";
      emit(db, me, { type: "proposal.rejected", entityType: "proposal", entityId: prop.id, project: p, data: { version: prop.version } });
      return prop;
    }),
};
