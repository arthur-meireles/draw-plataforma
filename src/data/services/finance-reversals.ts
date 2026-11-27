/**
 * RN-47 — ações reversas do financeiro: estornar baixa, cancelar NF emitida, desfazer aprovação de pagável e estornar
 * pagamento. Todas exigem acesso total ao recurso (Financeiro/Administração), motivo e geram evento com o estado anterior.
 */
import type { Database, ID, User } from "../types";
import { ApiError, emit, requireAccess, touch, write } from "./_core";
import { tellFreelancer } from "./finance";
import { applyInvoiceAmount } from "./payables-extra";

function requireReason(reason: string) {
  if (!reason.trim()) throw new ApiError(422, "Informe o motivo. Ele fica no histórico do lançamento.", { reason: "Informe o motivo" });
  return reason.trim();
}

function loadReceivable(db: Database, me: User, id: ID) {
  requireAccess(me, "receivables", "all", "Só o Financeiro e a administração fazem estornos. Peça a eles.");
  const r = db.receivables.find((x) => x.id === id && !x.deletedAt);
  if (!r) throw new ApiError(404, "Lançamento não encontrado.");
  return { r, project: db.projects.find((x) => x.id === r.projectId) ?? null };
}

function loadPayable(db: Database, me: User, id: ID) {
  requireAccess(me, "payables", "all", "Só o Financeiro e a administração fazem estornos. Peça a eles.");
  const p = db.payables.find((x) => x.id === id && !x.deletedAt);
  if (!p) throw new ApiError(404, "Lançamento não encontrado.");
  return { p, project: p.projectId ? (db.projects.find((x) => x.id === p.projectId) ?? null) : null };
}

export const reversalsApi = {
  /** Estornar baixa: `recebido` → `faturado` (a NF continua emitida). */
  undoReceipt: (id: ID, reason: string) =>
    write((db, me) => {
      const { r, project } = loadReceivable(db, me, id);
      const why = requireReason(reason);
      if (r.status !== "recebido") throw new ApiError(409, "Só lançamentos recebidos têm baixa para estornar.");
      const previous = { status: r.status, receivedAt: r.receivedAt };
      r.status = r.issuedAt ? "faturado" : "previsto";
      r.receivedAt = null;
      touch(r);
      emit(db, me, { type: "receivable.receipt_reversed", entityType: "receivable", entityId: r.id, project, data: { reason: why, previous, amountCents: r.amountCents } });
      return r;
    }),

  /** Cancelar NF emitida: `faturado` → `previsto`, limpa nº, data e arquivo (o anterior fica no evento). Recebido exige estornar a baixa antes. */
  cancelInvoice: (id: ID, reason: string) =>
    write((db, me) => {
      const { r, project } = loadReceivable(db, me, id);
      const why = requireReason(reason);
      if (r.status === "recebido") throw new ApiError(409, "Este lançamento já foi recebido. Estorne a baixa antes de cancelar a NF.");
      if (r.status === "cancelado" || !r.issuedAt) throw new ApiError(409, "Este lançamento não tem NF emitida.");
      const previous = { invoiceNumber: r.invoiceNumber, issuedAt: r.issuedAt, invoiceFileId: r.invoiceFileId, status: r.status };
      r.status = "previsto";
      r.invoiceNumber = null;
      r.issuedAt = null;
      r.invoiceFileId = null;
      touch(r);
      emit(db, me, { type: "receivable.invoice_cancelled", entityType: "receivable", entityId: r.id, project, data: { reason: why, previous } });
      return r;
    }),

  /** Desfazer aprovação: `aprovado` → volta à conferência (RN-04 reaplicada sobre a NF). Despesas nascem aprovadas e não voltam. */
  undoPayableApproval: (id: ID, reason: string) =>
    write((db, me) => {
      const { p, project } = loadPayable(db, me, id);
      const why = requireReason(reason);
      if (p.status !== "aprovado") throw new ApiError(409, "Só contas aprovadas (e ainda não pagas) podem voltar para conferência.");
      if (p.kind !== "freelancer" || p.invoicedAmountCents == null) throw new ApiError(409, "Despesas já nascem aprovadas. Para corrigir, edite ou cancele a despesa.");
      const previous = { status: p.status };
      applyInvoiceAmount(p, p.invoicedAmountCents);
      touch(p);
      emit(db, me, { type: "payable.approval_reversed", entityType: "payable", entityId: p.id, project, data: { reason: why, previous, status: p.status } });
      return p;
    }),

  /** Estornar pagamento: `pago` → `aprovado`, limpa a data; o freelancer é avisado (Caixa e e-mail) porque recebeu "pago". */
  reversePayment: (id: ID, reason: string) =>
    write((db, me) => {
      const { p, project } = loadPayable(db, me, id);
      const why = requireReason(reason);
      if (p.status !== "pago") throw new ApiError(409, "Só contas pagas têm pagamento para estornar.");
      const previous = { status: p.status, paidAt: p.paidAt };
      p.status = "aprovado";
      p.paidAt = null;
      touch(p);
      emit(db, me, { type: "payable.payment_reversed", entityType: "payable", entityId: p.id, project, data: { reason: why, previous, amountCents: p.invoicedAmountCents ?? p.agreedAmountCents } });
      tellFreelancer(db, me, p, project, { title: "Pagamento estornado", body: why, subject: "Seu pagamento foi estornado", template: "pagamento_freelancer_estornado" });
      return p;
    }),
};
