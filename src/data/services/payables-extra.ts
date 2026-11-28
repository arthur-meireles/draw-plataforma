/**
 * Contas a pagar de freelancers — caminhos que não dependem do formulário público (M5):
 * geração do pagável + pedido de NF (RN-03/RN-43), NF registrada manualmente (RN-41) e
 * pedido de nova NF (RN-42). Mesmas convenções de `_core`.
 */
import { CLIENT_LINK_DEFAULTS } from "../defaults";
import { baseFields, nowIso } from "../db";
import type { Database, FreelancerInvoiceRequest, ID, Payable, Project, ProjectMember, ShareLink, User } from "../types";
import { ApiError, emit, emitValueChange, notify, queueSystemEmail, touch, write } from "./_core";
import { canSeeMoney, canWriteAll } from "@/lib/permissions";

const LINK_DAYS = 30;
const LINK_MAX_USES = 3;
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** RN-06 — vencimento no dia de pagamento (Configurações) do mês seguinte a `from`. */
export function freelancerDueDate(db: Database, from: Date = new Date()): string {
  const day = db.organizations[0]?.settings.freelancerPaymentDay ?? 20;
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, day, 15)).toISOString();
}

const roleService = (m: ProjectMember) => (m.memberRole === "designer" ? "Design" : m.memberRole === "advogado" ? "Revisão jurídica" : m.memberRole === "roteirista" ? "Roteiro" : "Serviço");

const newToken = () => `nf-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * RN-03 / RN-43 — cria o pagável `aguardando_nf` de um membro freelancer, o link público de NF
 * (30 dias, 3 envios), o pedido de NF, o e-mail transacional e o aviso na Caixa de entrada.
 * Não checa permissão nem idempotência: quem chama decide (conclusão ou ação manual).
 */
export function createFreelancerPayable(
  db: Database,
  me: User,
  p: Project,
  m: ProjectMember,
  opts: { amountCents: number; dueAt?: string; description?: string; additional?: boolean },
): Payable {
  const fl = db.freelancers.find((f) => f.id === m.freelancerId);
  if (!fl) throw new ApiError(422, "Este membro não é um freelancer cadastrado.");
  const pay: Payable = {
    ...baseFields(me.id),
    projectId: p.id,
    kind: "freelancer",
    freelancerId: fl.id,
    projectMemberId: m.id,
    description: opts.description?.trim() || `${roleService(m)}${opts.additional ? " (adicional)" : ""} — ${p.code}`,
    agreedAmountCents: opts.amountCents,
    invoicedAmountCents: null,
    invoiceFileId: null,
    invoiceNumber: null,
    dueAt: opts.dueAt ?? freelancerDueDate(db),
    paidAt: null,
    status: "aguardando_nf",
    divergenceNote: null,
    invoiceIssuedAt: null,
  };
  db.payables.push(pay);
  const link: ShareLink = { ...baseFields(me.id), token: newToken(), purpose: "nf_freelancer", projectId: p.id, targetId: pay.id, expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString(), hasPassword: false, maxUses: LINK_MAX_USES, useCount: 0, revokedAt: null, ...CLIENT_LINK_DEFAULTS };
  db.shareLinks.push(link);
  const req: FreelancerInvoiceRequest = { ...baseFields(me.id), payableId: pay.id, shareLinkId: link.id, sentAt: nowIso(), submittedAt: null, declaredLegalName: null, declaredDocument: null, declaredPixKey: null, declaredInvoiceNumber: null, declaredAmountCents: null, source: null, reissueReason: null, reissueRequestedAt: null };
  db.freelancerInvoiceRequests.push(req);
  // freelancer importado sem e-mail: o pedido fica no link (copiar/reenviar depois de completar o cadastro)
  if (fl.email) queueSystemEmail(db, { to: [fl.email], subject: `Envie sua nota fiscal — ${p.code}`, template: "nf_freelancer", projectId: p.id });
  notify(db, me, { userId: fl.userId, type: "nf_solicitada", title: "Envie sua nota fiscal", project: p, entityType: "payable", entityId: pay.id });
  emit(db, me, { type: "payable.created", entityType: "payable", entityId: pay.id, project: p, data: { agreedAmountCents: pay.agreedAmountCents, kind: "freelancer", memberId: m.id, additional: !!opts.additional } });
  return pay;
}

const hasPayable = (db: Database, memberId: ID) => db.payables.some((pay) => pay.projectMemberId === memberId && !pay.deletedAt && pay.status !== "cancelado");

/** Decisão da conclusão para um freelancer pendente (RN-40). */
export type CompletionDecision = { memberId: ID; action: "pagar" | "sem_pagamento"; amountCents?: number | null };

/**
 * RN-40 — na conclusão, todo freelancer da equipe (ativo, ou removido com valor acordado e sem pagável) precisa
 * de uma decisão: gera pagamento (valor acordado ou informado agora) ou fica "sem pagamento". Nada é pulado em silêncio.
 */
export function completionCandidates(db: Database, projectId: ID) {
  return db.projectMembers
    .filter((m) => m.projectId === projectId && m.freelancerId && !m.deletedAt && !hasPayable(db, m.id))
    .filter((m) => m.active || (m.agreedAmountCents ?? 0) > 0)
    .map((m) => {
      const fl = db.freelancers.find((f) => f.id === m.freelancerId);
      const waived = !!m.paymentWaived;
      const amount = m.agreedAmountCents ?? 0;
      return {
        memberId: m.id,
        name: fl?.name ?? "—",
        memberRole: m.memberRole,
        active: m.active,
        agreedAmountCents: m.agreedAmountCents,
        paymentWaived: waived,
        /** Precisa de decisão explícita no diálogo: sem valor, ou removido da equipe antes da conclusão. */
        needsDecision: !waived && (amount <= 0 || !m.active),
      };
    });
}

/** Aplica as decisões e cria os pagáveis da conclusão. Lança 422 se faltar decisão. */
export function settleCompletionPayables(db: Database, me: User, p: Project, decisions: CompletionDecision[] = []): ID[] {
  const byId = new Map(decisions.map((d) => [d.memberId, d]));
  const candidates = completionCandidates(db, p.id);
  const errors: Record<string, string> = {};
  for (const c of candidates) {
    const d = byId.get(c.memberId);
    if (d?.action === "pagar" && !((d.amountCents ?? c.agreedAmountCents ?? 0) > 0)) errors[`member:${c.memberId}`] = `Informe o valor de ${c.name}`;
    else if (!d && c.needsDecision) errors[`member:${c.memberId}`] = c.active ? `Informe o valor de ${c.name} ou marque "sem pagamento"` : `${c.name} saiu da equipe: decida se recebe ou não`;
  }
  if (Object.keys(errors).length) throw new ApiError(422, "Defina o pagamento de cada freelancer antes de concluir.", errors);
  if (decisions.some((d) => d.action === "pagar" && d.amountCents != null) && !canSeeMoney(me)) throw new ApiError(403, "Seu perfil não pode definir valores. Peça à Gestão ou ao Financeiro.");

  const created: ID[] = [];
  for (const c of candidates) {
    const m = db.projectMembers.find((x) => x.id === c.memberId)!;
    const d = byId.get(c.memberId);
    if (d?.action === "sem_pagamento") {
      if (!m.paymentWaived) {
        m.paymentWaived = true;
        touch(m);
        emit(db, me, { type: "project.member_payment_waived", entityType: "project", entityId: p.id, project: p, data: { memberId: m.id, freelancerId: m.freelancerId } });
      }
      continue;
    }
    if (c.paymentWaived && !d) continue;
    if (d?.action === "pagar" && d.amountCents != null && d.amountCents !== m.agreedAmountCents) {
      emitValueChange(db, me, "project_member", m.id, p, "agreedAmountCents", m.agreedAmountCents, d.amountCents);
      m.agreedAmountCents = d.amountCents;
    }
    if (m.paymentWaived) m.paymentWaived = false;
    touch(m);
    created.push(createFreelancerPayable(db, me, p, m, { amountCents: m.agreedAmountCents! }).id);
  }
  return created;
}

function loadFreelancerPayable(db: Database, me: User, id: ID) {
  if (!canWriteAll(me, "payables")) throw new ApiError(403, "Seu perfil não altera contas a pagar. Peça ao Financeiro.");
  const pay = db.payables.find((x) => x.id === id && !x.deletedAt);
  if (!pay) throw new ApiError(404, "Lançamento não encontrado.");
  if (pay.kind !== "freelancer") throw new ApiError(409, "Só contas de freelancer têm nota fiscal a conferir.");
  const req = db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id) ?? null;
  const link = req ? (db.shareLinks.find((s) => s.id === req.shareLinkId) ?? null) : null;
  const project = pay.projectId ? (db.projects.find((x) => x.id === pay.projectId) ?? null) : null;
  return { pay, req, link, project };
}

/** RN-04 aplicado a qualquer canal: valor ≠ acordado → `divergente` com nota automática; igual → `em_conferencia`. */
export function applyInvoiceAmount(pay: Payable, amountCents: number): Payable["status"] {
  if (amountCents !== pay.agreedAmountCents) {
    pay.status = "divergente";
    pay.divergenceNote = `Valor da NF (${brl(amountCents)}) diferente do acordado (${brl(pay.agreedAmountCents)}).`;
  } else {
    pay.status = "em_conferencia";
    pay.divergenceNote = null;
  }
  return pay.status;
}

export interface ManualInvoiceInput {
  invoiceNumber: string;
  amountCents: number;
  issuedAt: string;
  invoiceFileId?: ID | null;
  note?: string | null;
}

export interface FreelancerPaymentInput {
  projectId: ID;
  memberId: ID;
  amountCents: number;
  dueAt?: string | null;
  description?: string | null;
  /** Pagamento extra para quem já tem conta a pagar neste projeto (sem isso, a ação é idempotente). */
  additional?: boolean;
}

export const payablesExtraApi = {
  /** RN-41 — NF recebida fora do formulário (e-mail, WhatsApp…): o Financeiro registra e segue a conferência. */
  registerInvoice: (payableId: ID, input: ManualInvoiceInput) =>
    write((db, me) => {
      const { pay, req, link, project } = loadFreelancerPayable(db, me, payableId);
      if (pay.status !== "aguardando_nf" && pay.status !== "divergente") throw new ApiError(409, "Só contas aguardando NF ou divergentes aceitam o registro manual da nota. Para trocar uma NF em conferência, use \"Pedir nova NF…\".");
      const errors: Record<string, string> = {};
      if (!input.invoiceNumber.trim()) errors.invoiceNumber = "Informe o número da NF";
      if (!(input.amountCents > 0)) errors.amountCents = "Informe o valor da NF";
      if (!input.issuedAt) errors.issuedAt = "Informe a data de emissão";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const previous = { invoiceNumber: pay.invoiceNumber, amountCents: pay.invoicedAmountCents, status: pay.status };
      pay.invoiceNumber = input.invoiceNumber.trim();
      pay.invoicedAmountCents = input.amountCents;
      pay.invoiceIssuedAt = input.issuedAt;
      if (input.invoiceFileId !== undefined && input.invoiceFileId !== null) pay.invoiceFileId = input.invoiceFileId;
      applyInvoiceAmount(pay, input.amountCents);
      touch(pay);
      if (req) {
        const fl = db.freelancers.find((f) => f.id === pay.freelancerId);
        Object.assign(req, {
          submittedAt: nowIso(),
          source: "manual",
          declaredInvoiceNumber: pay.invoiceNumber,
          declaredAmountCents: input.amountCents,
          declaredLegalName: req.declaredLegalName ?? fl?.legalName ?? fl?.name ?? null,
          declaredDocument: req.declaredDocument ?? fl?.document ?? null,
          declaredPixKey: req.declaredPixKey ?? fl?.pixKey ?? null,
        });
        touch(req);
      }
      // o link público deixa de aceitar envio (o formulário mostra "já enviada")
      if (link) touch(link);
      emit(db, me, {
        type: "payable.invoice_registered",
        entityType: "payable",
        entityId: pay.id,
        project,
        data: { manual: true, invoiceNumber: pay.invoiceNumber, amountCents: input.amountCents, issuedAt: input.issuedAt, hasFile: !!pay.invoiceFileId, divergent: pay.status === "divergente", previous, note: input.note?.trim() || null },
      });
      return pay;
    }),

  /**
   * RN-42 — NF em conferência ou divergente recusada: volta a `aguardando_nf`, limpa a NF enviada (o histórico fica nos
   * eventos), renova o link (validade + envios) e avisa o freelancer por e-mail e na Caixa de entrada com o motivo.
   */
  requestNewInvoice: (payableId: ID, reason: string) =>
    write((db, me) => {
      const { pay, req, link, project } = loadFreelancerPayable(db, me, payableId);
      if (pay.status !== "em_conferencia" && pay.status !== "divergente") throw new ApiError(409, "Só NFs em conferência ou divergentes podem ser recusadas. Uma NF aprovada ou paga não volta para o freelancer.");
      if (!reason.trim()) throw new ApiError(422, "Diga ao freelancer o que precisa ser corrigido.", { reason: "Descreva o motivo" });
      const previous = { invoiceNumber: pay.invoiceNumber, amountCents: pay.invoicedAmountCents, invoiceFileId: pay.invoiceFileId, status: pay.status, divergenceNote: pay.divergenceNote };
      pay.status = "aguardando_nf";
      pay.invoicedAmountCents = null;
      pay.invoiceNumber = null;
      pay.invoiceFileId = null;
      pay.invoiceIssuedAt = null;
      pay.divergenceNote = null;
      touch(pay);
      let activeLink = link;
      if (!activeLink) {
        activeLink = { ...baseFields(me.id), token: newToken(), purpose: "nf_freelancer", projectId: pay.projectId, targetId: pay.id, expiresAt: "", hasPassword: false, maxUses: LINK_MAX_USES, useCount: 0, revokedAt: null, ...CLIENT_LINK_DEFAULTS };
        db.shareLinks.push(activeLink);
      }
      activeLink.expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
      activeLink.revokedAt = null;
      activeLink.useCount = 0;
      touch(activeLink);
      const now = nowIso();
      if (req) {
        Object.assign(req, { shareLinkId: activeLink.id, sentAt: now, submittedAt: null, source: null, declaredInvoiceNumber: null, declaredAmountCents: null, reissueReason: reason.trim(), reissueRequestedAt: now });
        touch(req);
      } else {
        db.freelancerInvoiceRequests.push({ ...baseFields(me.id), payableId: pay.id, shareLinkId: activeLink.id, sentAt: now, submittedAt: null, declaredLegalName: null, declaredDocument: null, declaredPixKey: null, declaredInvoiceNumber: null, declaredAmountCents: null, source: null, reissueReason: reason.trim(), reissueRequestedAt: now });
      }
      const fl = db.freelancers.find((f) => f.id === pay.freelancerId);
      if (fl) {
        if (fl.email) queueSystemEmail(db, { to: [fl.email], subject: `Envie uma nova nota fiscal${project ? ` — ${project.code}` : ""}`, template: "nf_freelancer_nova", projectId: pay.projectId });
        notify(db, me, { userId: fl.userId, type: "nf_solicitada", title: "A Draw pediu uma nova nota fiscal", body: reason.trim(), project, entityType: "payable", entityId: pay.id });
      }
      emit(db, me, { type: "payable.invoice_rejected", entityType: "payable", entityId: pay.id, project, data: { reason: reason.trim(), previous } });
      return { payable: pay, token: activeLink.token };
    }),

  /**
   * RN-43 — gera o pagamento + pedido de NF de um freelancer da equipe sem concluir o projeto (ou depois dela).
   * Idempotente por membro: com conta já existente, só cria outra se `additional`.
   */
  createFreelancerPayment: (input: FreelancerPaymentInput) =>
    write((db, me) => {
      if (!canWriteAll(me, "payables")) throw new ApiError(403, "Seu perfil não cria contas a pagar. Peça ao Financeiro.");
      const p = db.projects.find((x) => (x.id === input.projectId || x.code === input.projectId) && !x.deletedAt);
      if (!p) throw new ApiError(404, "Projeto não encontrado.");
      if (p.status === "cotacao" || p.status === "perdido") throw new ApiError(409, "Cotações não geram pagamento a freelancer. Aprove a proposta antes.");
      const m = db.projectMembers.find((x) => x.id === input.memberId && x.projectId === p.id && !x.deletedAt);
      if (!m || !m.freelancerId) throw new ApiError(422, "Escolha um freelancer da equipe do projeto.", { memberId: "Escolha um freelancer da equipe" });
      const errors: Record<string, string> = {};
      if (!(input.amountCents > 0)) errors.amountCents = "Informe o valor a pagar";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      if (hasPayable(db, m.id) && !input.additional) {
        const name = db.freelancers.find((f) => f.id === m.freelancerId)?.name ?? "Este freelancer";
        throw new ApiError(409, `${name} já tem conta a pagar neste projeto. Marque "Pagamento adicional" se for outro valor.`, { additional: "Já existe pagamento para este freelancer" });
      }
      if (!input.additional && input.amountCents !== m.agreedAmountCents) {
        emitValueChange(db, me, "project_member", m.id, p, "agreedAmountCents", m.agreedAmountCents, input.amountCents);
        m.agreedAmountCents = input.amountCents;
      }
      if (m.paymentWaived) m.paymentWaived = false;
      touch(m);
      return createFreelancerPayable(db, me, p, m, { amountCents: input.amountCents, dueAt: input.dueAt || undefined, description: input.description ?? undefined, additional: !!input.additional });
    }),
};
