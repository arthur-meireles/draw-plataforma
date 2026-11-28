/**
 * Financeiro — complementos dos furos médios (RN-85, RN-86, RN-87): lançamento avulso a receber, reativar lançamento
 * cancelado, editar/cancelar/reativar contas a pagar e despesas com favorecido e categoria.
 */
import { baseFields } from "../db";
import type { Database, ID, Payable, Receivable, User } from "../types";
import { ApiError, emit, emitValueChange, requireAccess, taxOf, touch, write } from "./_core";

const requireReason = (reason: string | undefined | null) => {
  if (!reason?.trim()) throw new ApiError(422, "Informe o motivo. Ele fica no histórico do lançamento.", { reason: "Informe o motivo" });
  return reason.trim();
};

function loadPayable(db: Database, me: User, id: ID) {
  requireAccess(me, "payables", "all", "Só o Financeiro e a administração alteram contas a pagar. Peça a eles.");
  const p = db.payables.find((x) => x.id === id && !x.deletedAt);
  if (!p) throw new ApiError(404, "Lançamento não encontrado.");
  return { p, project: p.projectId ? (db.projects.find((x) => x.id === p.projectId) ?? null) : null };
}

export interface NewReceivableInput {
  projectId: ID;
  description: string;
  amountCents: number;
  expectedAt: string;
}

export interface PayablePatch {
  description?: string;
  dueAt?: string;
  /** Só despesas (o valor do freelancer vem do acordado/NF). */
  agreedAmountCents?: number;
  payeeName?: string | null;
  category?: string | null;
}

export const financeMedioApi = {
  /** RN-85 — "Novo recebível": parcela avulsa de um projeto ativo ou concluído (não altera o contratado). */
  createReceivable: (input: NewReceivableInput) =>
    write((db, me) => {
      requireAccess(me, "receivables", "all", "Só o Financeiro e a administração criam lançamentos a receber.");
      const p = db.projects.find((x) => (x.id === input.projectId || x.code === input.projectId) && !x.deletedAt);
      const errors: Record<string, string> = {};
      if (!p) errors.projectId = "Escolha o projeto";
      if (!input.description?.trim()) errors.description = "Descreva o lançamento";
      if (!(input.amountCents > 0)) errors.amountCents = "Informe o valor";
      if (!input.expectedAt) errors.expectedAt = "Informe o vencimento";
      if (Object.keys(errors).length || !p) throw new ApiError(422, "Revise os campos destacados.", errors);
      if (p.status !== "ativo" && p.status !== "concluido") throw new ApiError(409, "Só projetos ativos ou concluídos recebem lançamentos. Para cotações, aprove a proposta.");
      const r: Receivable = {
        ...baseFields(me.id),
        projectId: p.id,
        clientId: p.clientId,
        proposalInstallmentId: null,
        description: input.description.trim(),
        amountCents: input.amountCents,
        taxCents: taxOf(db, input.amountCents),
        expectedAt: input.expectedAt,
        invoiceNumber: null,
        invoiceFileId: null,
        issuedAt: null,
        receivedAt: null,
        status: "previsto",
        kind: "parcela",
        collectionNote: null,
        dueBasis: "Informado no lançamento",
      };
      db.receivables.push(r);
      emit(db, me, { type: "receivable.created", entityType: "receivable", entityId: r.id, project: p, data: { amountCents: r.amountCents, description: r.description, manual: true } });
      return r;
    }),

  /** RN-85 — reativa lançamento cancelado por engano (volta a Previsto, ou Faturado se a NF ficou). */
  reactivateReceivable: (id: ID, reason: string) =>
    write((db, me) => {
      requireAccess(me, "receivables", "all", "Só o Financeiro e a administração reativam lançamentos.");
      const r = db.receivables.find((x) => x.id === id && !x.deletedAt);
      if (!r) throw new ApiError(404, "Lançamento não encontrado.");
      const why = requireReason(reason);
      if (r.status !== "cancelado") throw new ApiError(409, "Só lançamentos cancelados podem ser reativados.");
      const p = db.projects.find((x) => x.id === r.projectId) ?? null;
      if (p && (p.status === "cancelado" || p.status === "perdido")) throw new ApiError(409, "O projeto está cancelado. Reative o projeto antes de reativar o lançamento.");
      r.status = r.issuedAt ? "faturado" : "previsto";
      r.cancelReason = null;
      touch(r);
      emit(db, me, { type: "receivable.reactivated", entityType: "receivable", entityId: r.id, project: p, data: { reason: why, status: r.status } });
      return r;
    }),

  /** RN-86 — editar vencimento e descrição de qualquer conta a pagar; valor só de despesa (antes de paga). */
  updatePayable: (id: ID, patch: PayablePatch) =>
    write((db, me) => {
      const { p, project } = loadPayable(db, me, id);
      if (p.status === "pago" || p.status === "cancelado") throw new ApiError(409, p.status === "pago" ? "Esta conta já foi paga. Estorne o pagamento para editar." : "Esta conta está cancelada. Reative-a para editar.");
      const errors: Record<string, string> = {};
      if (patch.description !== undefined && !patch.description.trim()) errors.description = "Descreva o lançamento";
      if (patch.dueAt !== undefined && !patch.dueAt) errors.dueAt = "Informe o vencimento";
      if (patch.agreedAmountCents !== undefined) {
        if (p.kind === "freelancer") errors.agreedAmountCents = "O valor do freelancer vem do acordado e da NF";
        else if (!(patch.agreedAmountCents > 0)) errors.agreedAmountCents = "Informe o valor";
      }
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      if (patch.dueAt !== undefined && patch.dueAt !== p.dueAt) {
        emitValueChange(db, me, "payable", p.id, project, "dueAt", p.dueAt, patch.dueAt);
        p.dueAt = patch.dueAt;
      }
      if (patch.agreedAmountCents !== undefined && patch.agreedAmountCents !== p.agreedAmountCents) {
        emitValueChange(db, me, "payable", p.id, project, "agreedAmountCents", p.agreedAmountCents, patch.agreedAmountCents);
        p.agreedAmountCents = patch.agreedAmountCents;
      }
      if (patch.description !== undefined) p.description = patch.description.trim();
      if (p.kind !== "freelancer") {
        if (patch.payeeName !== undefined) p.payeeName = patch.payeeName?.trim() || null;
        if (patch.category !== undefined) p.category = patch.category?.trim() || null;
      }
      touch(p);
      emit(db, me, { type: "payable.updated", entityType: "payable", entityId: p.id, project, data: { fields: Object.keys(patch) } });
      return p;
    }),

  /** RN-86 — cancela conta a pagar não paga (com motivo); some das somas e do custo do projeto. */
  cancelPayable: (id: ID, reason: string) =>
    write((db, me) => {
      const { p, project } = loadPayable(db, me, id);
      const why = requireReason(reason);
      if (p.status === "pago") throw new ApiError(409, "Conta paga não pode ser cancelada. Estorne o pagamento antes.");
      if (p.status === "cancelado") throw new ApiError(409, "Esta conta já está cancelada.");
      const previous = p.status;
      p.status = "cancelado";
      p.cancelReason = why;
      // link público de NF deixa de valer (revogar — RN-86)
      const req = db.freelancerInvoiceRequests.find((r) => r.payableId === p.id);
      const link = req ? db.shareLinks.find((s) => s.id === req.shareLinkId) : null;
      if (link && !link.revokedAt) link.revokedAt = new Date().toISOString();
      touch(p);
      emit(db, me, { type: "payable.cancelled", entityType: "payable", entityId: p.id, project, data: { reason: why, previousStatus: previous } });
      return p;
    }),

  /** RN-86 — reativa conta cancelada: volta a aguardar NF (freelancer) ou a aprovada (despesa). */
  reactivatePayable: (id: ID, reason: string) =>
    write((db, me) => {
      const { p, project } = loadPayable(db, me, id);
      const why = requireReason(reason);
      if (p.status !== "cancelado") throw new ApiError(409, "Só contas canceladas podem ser reativadas.");
      if (project && (project.status === "cancelado" || project.status === "perdido")) throw new ApiError(409, "O projeto está cancelado. Reative o projeto antes de reativar a conta.");
      p.status = p.kind === "freelancer" ? "aguardando_nf" : "aprovado";
      p.cancelReason = null;
      p.invoicedAmountCents = null;
      p.invoiceNumber = null;
      p.invoiceFileId = null;
      const req = db.freelancerInvoiceRequests.find((r) => r.payableId === p.id);
      const link = req ? db.shareLinks.find((s) => s.id === req.shareLinkId) : null;
      if (link) {
        link.revokedAt = null;
        link.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
      }
      touch(p);
      emit(db, me, { type: "payable.reactivated", entityType: "payable", entityId: p.id, project, data: { reason: why, status: p.status } });
      return p;
    }),
};

/** Usado pelo cancelamento do projeto (RN-86): contas de freelancer ainda não pagas viram `cancelado`. */
export function cancelOpenFreelancerPayables(db: Database, me: User, projectId: ID, reason: string): ID[] {
  const ids: ID[] = [];
  for (const p of db.payables as Payable[]) {
    if (p.projectId !== projectId || p.deletedAt || p.kind !== "freelancer") continue;
    if (p.status !== "aguardando_nf") continue; // com NF recebida/aprovada o Financeiro decide (RN-68)
    p.status = "cancelado";
    p.cancelReason = `Projeto cancelado: ${reason}`;
    const req = db.freelancerInvoiceRequests.find((r) => r.payableId === p.id);
    const link = req ? db.shareLinks.find((s) => s.id === req.shareLinkId) : null;
    if (link && !link.revokedAt) link.revokedAt = new Date().toISOString();
    touch(p);
    emit(db, me, { type: "payable.cancelled", entityType: "payable", entityId: p.id, project: db.projects.find((x) => x.id === projectId), data: { reason: p.cancelReason, previousStatus: "aguardando_nf", viaProject: true } });
    ids.push(p.id);
  }
  return ids;
}
