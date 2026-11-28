/** Financeiro (M5) — sempre por projeto. */
import { baseFields, loadDb, nowIso, transaction } from "../db";
import type { Database, ID, Payable, PayableStatus, Project, Receivable, ReceivableStatus, User } from "../types";
import { ApiError, taxOf, emit, emitValueChange, freelancerIdOf, latency, notify, queueSystemEmail, read, touch, write } from "./_core";
import { applyInvoiceAmount } from "./payables-extra";
import { computeFinancials } from "./projects";
import { clientTermDays, dueFromInvoice, effectiveReceivableStatus, financeAudience, financeContactOf, maskTail } from "./finance-rules";
import { notifyMany } from "./audience";
import { access, canWriteAll } from "@/lib/permissions";

export interface ReceivableFilters {
  status?: ReceivableStatus[];
  clientId?: ID;
  projectId?: ID;
  month?: string; // yyyy-mm
  q?: string;
}
export interface PayableFilters {
  status?: PayableStatus[];
  kind?: Payable["kind"];
  freelancerId?: ID;
  projectId?: ID;
  month?: string;
  q?: string;
}

/**
 * RN-46 — avisa o freelancer do pagável: Caixa de entrada (se ele tiver login) e, quando indicado, e-mail
 * transacional externo (divergência e pagamento — ele não acompanha o financeiro por dentro).
 */
export function tellFreelancer(db: Database, me: User, pay: Payable, project: Project | null, msg: { title: string; body?: string; subject?: string; template?: string }) {
  if (pay.kind !== "freelancer" || !pay.freelancerId) return;
  const fl = db.freelancers.find((f) => f.id === pay.freelancerId);
  if (!fl) return;
  notify(db, me, { userId: fl.userId, type: "pagamento", title: msg.title, body: msg.body, project, entityType: "payable", entityId: pay.id });
  if (msg.template && fl.email) queueSystemEmail(db, { to: [fl.email], subject: `${msg.subject ?? msg.title}${project ? ` — ${project.code}` : ""}`, template: msg.template, projectId: pay.projectId });
}

const inMonth = (iso: string | null, month?: string) => !month || (!!iso && iso.slice(0, 7) === month);


export const financeApi = {
  receivables: (f: ReceivableFilters = {}) =>
    read((db, me) => {
      if (access(me, "receivables") === "-") throw new ApiError(403, "Sem acesso a contas a receber.");
      const q = f.q?.trim().toLowerCase();
      return db.receivables
        .filter((r) => !r.deletedAt)
        .map((r) => ({ ...r, status: effectiveReceivableStatus(r) }))
        .filter((r) => !f.status || f.status.includes(r.status))
        .filter((r) => !f.clientId || r.clientId === f.clientId)
        .filter((r) => !f.projectId || r.projectId === f.projectId)
        .filter((r) => inMonth(r.expectedAt, f.month))
        .map((r) => {
          const p = db.projects.find((x) => x.id === r.projectId)!;
          const c = db.clients.find((x) => x.id === r.clientId)!;
          return { ...r, projectCode: p.code, projectTitle: p.title, clientName: c.tradeName, clientCnpj: c.cnpj };
        })
        .filter((r) => !q || `${r.projectCode} ${r.projectTitle} ${r.clientName} ${r.description} ${r.invoiceNumber ?? ""}`.toLowerCase().includes(q))
        .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt));
    }),

  /** RF-M5-02 — emissão de NF. */
  issueInvoice: (id: ID, input: { invoiceNumber: string; issuedAt: string; invoiceFileId?: ID | null; taxCents?: number; expectedAt?: string | null }) =>
    write((db, me) => {
      if (!canWriteAll(me, "receivables")) throw new ApiError(403, "Sem permissão.");
      const r = db.receivables.find((x) => x.id === id);
      if (!r) throw new ApiError(404, "Lançamento não encontrado.");
      if (!input.invoiceNumber.trim()) throw new ApiError(422, "Informe o número da NF.", { invoiceNumber: "Informe o número da NF" });
      if (r.status === "recebido" || r.status === "cancelado") throw new ApiError(409, "Este lançamento já foi encerrado.");
      r.invoiceNumber = input.invoiceNumber.trim();
      r.issuedAt = input.issuedAt;
      r.invoiceFileId = input.invoiceFileId ?? r.invoiceFileId;
      if (input.taxCents != null) r.taxCents = input.taxCents;
      const p = db.projects.find((x) => x.id === r.projectId)!;
      // RN-45 — vencimento da cobrança: o informado no diálogo; sem ele, emissão + prazo do cliente (se houver)
      const due = input.expectedAt ?? dueFromInvoice(db, r.clientId, input.issuedAt);
      if (due && due !== r.expectedAt) {
        emitValueChange(db, me, "receivable", r.id, p, "expectedAt", r.expectedAt, due);
        r.expectedAt = due;
        const term = clientTermDays(db, r.clientId);
        r.dueBasis = input.expectedAt ? (term != null && dueFromInvoice(db, r.clientId, input.issuedAt) === due ? `Emissão da NF + ${term} dias (prazo do cliente)` : "Informado na emissão da NF") : `Emissão da NF + ${term} dias (prazo do cliente)`;
      }
      r.status = "faturado";
      touch(r);
      emit(db, me, { type: "receivable.invoiced", entityType: "receivable", entityId: r.id, project: p, data: { invoiceNumber: r.invoiceNumber, amountCents: r.amountCents } });
      return r;
    }),

  receive: (id: ID, receivedAt: string) =>
    write((db, me) => {
      if (!canWriteAll(me, "receivables")) throw new ApiError(403, "Sem permissão.");
      const r = db.receivables.find((x) => x.id === id);
      if (!r) throw new ApiError(404, "Lançamento não encontrado.");
      if (!r.issuedAt) throw new ApiError(409, "Emita a NF antes de dar baixa.");
      if (r.status === "recebido" || r.status === "cancelado") throw new ApiError(409, "Este lançamento já foi encerrado.");
      // RN-85 — a data do recebimento não é anterior à emissão da NF nem futura
      if (new Date(receivedAt).getTime() < new Date(r.issuedAt).getTime() - 86_400_000) throw new ApiError(422, "A data do recebimento não pode ser antes da emissão da NF.", { date: "Antes da emissão da NF" });
      if (new Date(receivedAt).getTime() > Date.now() + 86_400_000) throw new ApiError(422, "A data do recebimento não pode estar no futuro.", { date: "Data no futuro" });
      r.status = "recebido";
      r.receivedAt = receivedAt;
      touch(r);
      const p = db.projects.find((x) => x.id === r.projectId)!;
      emit(db, me, { type: "receivable.received", entityType: "receivable", entityId: r.id, project: p, data: { amountCents: r.amountCents } });
      return r;
    }),

  updateReceivable: (id: ID, patch: { amountCents?: number; expectedAt?: string; description?: string }) =>
    write((db, me) => {
      if (!canWriteAll(me, "receivables")) throw new ApiError(403, "Sem permissão.");
      const r = db.receivables.find((x) => x.id === id);
      if (!r) throw new ApiError(404, "Lançamento não encontrado.");
      const p = db.projects.find((x) => x.id === r.projectId)!;
      if (r.status === "recebido" || r.status === "cancelado") throw new ApiError(409, "Este lançamento já foi encerrado. Estorne a baixa ou reative o lançamento para editar.");
      if (patch.amountCents !== undefined && patch.amountCents !== r.amountCents) {
        if (patch.amountCents <= 0) throw new ApiError(422, "Informe um valor maior que zero.", { amount: "Informe um valor maior que zero" });
        // RN-85 — depois da NF o valor é o da nota: cancele a NF (RN-47) para corrigir
        if (r.issuedAt) throw new ApiError(409, "Este lançamento já tem NF emitida: o valor é o da nota. Cancele a NF, corrija o valor e emita de novo.");
        emitValueChange(db, me, "receivable", r.id, p, "amountCents", r.amountCents, patch.amountCents);
        // RN-85 — o imposto acompanha o valor (RN-15) enquanto não há NF
        const tax = taxOf(db, patch.amountCents);
        emitValueChange(db, me, "receivable", r.id, p, "taxCents", r.taxCents, tax);
        r.taxCents = tax;
      }
      if (patch.expectedAt !== undefined && patch.expectedAt !== r.expectedAt) {
        emitValueChange(db, me, "receivable", r.id, p, "expectedAt", r.expectedAt, patch.expectedAt);
        r.dueBasis = "Alterado manualmente";
      }
      Object.assign(r, patch);
      touch(r);
      return r;
    }),

  /** Cobrança adicional (planilha: Valor/Status/Data Cobrança Adicional). */
  addAdditionalCharge: (projectId: ID, input: { description: string; amountCents: number; expectedAt: string }) =>
    write((db, me) => {
      if (!canWriteAll(me, "receivables")) throw new ApiError(403, "Sem permissão.");
      const p = db.projects.find((x) => x.id === projectId || x.code === projectId);
      if (!p) throw new ApiError(404, "Projeto não encontrado.");
      if (p.status !== "ativo" && p.status !== "concluido") throw new ApiError(409, "Cobrança adicional só em projeto ativo ou concluído.");
      const errors: Record<string, string> = {};
      if (!input.description.trim()) errors.description = "Descreva o que está sendo cobrado";
      if (input.amountCents <= 0) errors.amountCents = "Informe o valor";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const r: Receivable = { ...baseFields(me.id), projectId: p.id, clientId: p.clientId, proposalInstallmentId: null, description: input.description.trim(), amountCents: input.amountCents, taxCents: taxOf(db, input.amountCents), expectedAt: input.expectedAt, invoiceNumber: null, invoiceFileId: null, issuedAt: null, receivedAt: null, status: "previsto", kind: "adicional", collectionNote: null };
      db.receivables.push(r);
      emit(db, me, { type: "receivable.additional_created", entityType: "receivable", entityId: r.id, project: p, data: { amountCents: r.amountCents, description: r.description } });
      return r;
    }),

  /** Comentário de cobrança (planilha: Status/Comentários Cobrança). */
  setCollectionNote: (id: ID, note: string) =>
    write((db, me) => {
      if (!canWriteAll(me, "receivables")) throw new ApiError(403, "Sem permissão.");
      const r = db.receivables.find((x) => x.id === id);
      if (!r) throw new ApiError(404, "Lançamento não encontrado.");
      r.collectionNote = note.trim() || null;
      touch(r);
      emit(db, me, { type: "receivable.collection_note", entityType: "receivable", entityId: r.id, project: db.projects.find((x) => x.id === r.projectId), data: { note: r.collectionNote } });
      return r;
    }),

  /** RN-85 — cancelar exige motivo; lançamento recebido não cancela (estorne a baixa antes). */
  cancelReceivable: (id: ID, reason: string) =>
    write((db, me) => {
      if (!canWriteAll(me, "receivables")) throw new ApiError(403, "Sem permissão.");
      const r = db.receivables.find((x) => x.id === id);
      if (!r) throw new ApiError(404, "Lançamento não encontrado.");
      if (!reason?.trim()) throw new ApiError(422, "Informe o motivo. Ele fica no histórico do lançamento.", { reason: "Informe o motivo" });
      if (r.status === "recebido") throw new ApiError(409, "Lançamento recebido não pode ser cancelado. Estorne a baixa antes (Estornar baixa…).");
      if (r.status === "cancelado") throw new ApiError(409, "Este lançamento já está cancelado.");
      r.status = "cancelado";
      r.cancelReason = reason.trim();
      touch(r);
      emit(db, me, { type: "receivable.cancelled", entityType: "receivable", entityId: r.id, project: db.projects.find((x) => x.id === r.projectId), data: { reason: reason.trim() } });
    }),

  payables: (f: PayableFilters = {}) =>
    read((db, me) => {
      const a = access(me, "payables");
      if (a === "-") throw new ApiError(403, "Sem acesso a contas a pagar.");
      const myFl = freelancerIdOf(db, me);
      const q = f.q?.trim().toLowerCase();
      return db.payables
        .filter((p) => !p.deletedAt)
        .filter((p) => a !== "P" || (myFl && p.freelancerId === myFl))
        .filter((p) => !f.status || f.status.includes(p.status))
        .filter((p) => !f.kind || p.kind === f.kind)
        .filter((p) => !f.freelancerId || p.freelancerId === f.freelancerId)
        .filter((p) => !f.projectId || p.projectId === f.projectId)
        .filter((p) => inMonth(p.dueAt, f.month))
        .map((p) => {
          const proj = p.projectId ? db.projects.find((x) => x.id === p.projectId) : null;
          const fl = p.freelancerId ? db.freelancers.find((x) => x.id === p.freelancerId) : null;
          const req = db.freelancerInvoiceRequests.find((r) => r.payableId === p.id);
          const link = req ? db.shareLinks.find((s) => s.id === req.shareLinkId) : null;
          return {
            ...p,
            projectCode: proj?.code ?? null,
            projectTitle: proj?.title ?? null,
            freelancerName: fl?.name ?? null,
            freelancerColor: fl?.avatarColor ?? null,
            invoiceRequest: req ?? null,
            shareToken: link && !link.revokedAt ? link.token : null,
            isOverdue: p.status !== "pago" && new Date(p.dueAt).getTime() < Date.now(),
          };
        })
        .filter((p) => !q || `${p.projectCode ?? ""} ${p.freelancerName ?? ""} ${p.description}`.toLowerCase().includes(q))
        .sort((x, y) => x.dueAt.localeCompare(y.dueAt));
    }),

  /** RF-M5-03 — despesas lançadas manualmente. */
  createExpense: (input: { kind: "despesa_projeto" | "despesa_adm"; projectId?: ID | null; description: string; agreedAmountCents: number; dueAt: string }) =>
    write((db, me) => {
      if (!canWriteAll(me, "payables")) throw new ApiError(403, "Sem permissão.");
      const errors: Record<string, string> = {};
      if (!input.description.trim()) errors.description = "Descreva a despesa";
      if (input.agreedAmountCents <= 0) errors.agreedAmountCents = "Informe o valor";
      if (input.kind === "despesa_projeto" && !input.projectId) errors.projectId = "Escolha o projeto";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const p: Payable = {
        ...baseFields(me.id),
        projectId: input.kind === "despesa_adm" ? null : (input.projectId ?? null),
        kind: input.kind,
        freelancerId: null,
        projectMemberId: null,
        description: input.description.trim(),
        agreedAmountCents: input.agreedAmountCents,
        invoicedAmountCents: null,
        invoiceFileId: null,
        invoiceNumber: null,
        dueAt: input.dueAt,
        paidAt: null,
        status: "aprovado",
        divergenceNote: null,
      };
      db.payables.push(p);
      emit(db, me, { type: "payable.created", entityType: "payable", entityId: p.id, project: p.projectId ? db.projects.find((x) => x.id === p.projectId) : null, data: { amountCents: p.agreedAmountCents, kind: p.kind } });
      return p;
    }),

  /** RN-04 — aprovação manual após conferência. */
  approvePayable: (id: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "payables")) throw new ApiError(403, "Sem permissão.");
      const p = db.payables.find((x) => x.id === id);
      if (!p) throw new ApiError(404, "Lançamento não encontrado.");
      if (!["em_conferencia", "divergente"].includes(p.status)) throw new ApiError(409, "Só NFs em conferência ou divergentes podem ser aprovadas.");
      p.status = "aprovado";
      touch(p);
      const proj = db.projects.find((x) => x.id === p.projectId) ?? null;
      emit(db, me, { type: "payable.approved", entityType: "payable", entityId: p.id, project: proj, data: {} });
      tellFreelancer(db, me, p, proj, { title: "Sua NF foi aprovada", body: `Pagamento previsto para ${new Date(p.dueAt).toLocaleDateString("pt-BR")}` });
      return p;
    }),

  markDivergent: (id: ID, note: string) =>
    write((db, me) => {
      if (!canWriteAll(me, "payables")) throw new ApiError(403, "Sem permissão.");
      const p = db.payables.find((x) => x.id === id);
      if (!p) throw new ApiError(404, "Lançamento não encontrado.");
      if (!note.trim()) throw new ApiError(422, "Descreva a divergência.", { note: "Descreva a divergência" });
      if (p.status !== "em_conferencia" && p.status !== "divergente") throw new ApiError(409, "Só NFs em conferência podem ser marcadas como divergentes.");
      p.status = "divergente";
      p.divergenceNote = note.trim();
      touch(p);
      const proj = db.projects.find((x) => x.id === p.projectId) ?? null;
      emit(db, me, { type: "payable.divergent", entityType: "payable", entityId: p.id, project: proj, data: { note } });
      tellFreelancer(db, me, p, proj, { title: "Sua NF tem uma divergência", body: note.trim(), subject: "Sua nota fiscal tem uma divergência", template: "nf_freelancer_divergente" });
      return p;
    }),

  pay: (id: ID, paidAt: string) =>
    write((db, me) => {
      if (!canWriteAll(me, "payables")) throw new ApiError(403, "Sem permissão.");
      const p = db.payables.find((x) => x.id === id);
      if (!p) throw new ApiError(404, "Lançamento não encontrado.");
      if (p.status !== "aprovado") throw new ApiError(409, "Aprove o lançamento antes de pagar.");
      p.status = "pago";
      p.paidAt = paidAt;
      touch(p);
      const proj = db.projects.find((x) => x.id === p.projectId) ?? null;
      emit(db, me, { type: "payable.paid", entityType: "payable", entityId: p.id, project: proj, data: { amountCents: p.invoicedAmountCents ?? p.agreedAmountCents } });
      tellFreelancer(db, me, p, proj, { title: "Pagamento realizado", body: `${p.description} · pago em ${new Date(paidAt).toLocaleDateString("pt-BR")}`, subject: "Seu pagamento foi realizado", template: "pagamento_freelancer" });
      return p;
    }),

  resendInvoiceLink: (payableId: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "payables")) throw new ApiError(403, "Seu perfil não reenvia pedidos de NF. Peça ao Financeiro.");
      const p = db.payables.find((x) => x.id === payableId);
      if (!p || !p.freelancerId) throw new ApiError(404, "Lançamento não encontrado.");
      const req = db.freelancerInvoiceRequests.find((r) => r.payableId === p.id);
      const link = req ? db.shareLinks.find((s) => s.id === req.shareLinkId) : null;
      if (link) {
        link.expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
        link.revokedAt = null;
        // link esgotado não serve para nada: o reenvio devolve os envios (RN-42)
        if (link.maxUses && link.useCount >= link.maxUses) link.useCount = 0;
      }
      if (req) req.sentAt = nowIso();
      const fl = db.freelancers.find((f) => f.id === p.freelancerId)!;
      if (!fl.email) throw new ApiError(422, `Cadastre o e-mail de ${fl.name} em Freelancers para reenviar o link. Enquanto isso, use "Copiar link".`);
      const proj = db.projects.find((x) => x.id === p.projectId) ?? null;
      queueSystemEmail(db, { to: [fl.email], subject: "Lembrete: envie sua nota fiscal", template: "nf_freelancer", projectId: p.projectId });
      if (p.status === "aguardando_nf") notify(db, me, { userId: fl.userId, type: "nf_solicitada", title: "Lembrete: envie sua nota fiscal", project: proj, entityType: "payable", entityId: p.id });
      emit(db, me, { type: "payable.link_resent", entityType: "payable", entityId: p.id, project: proj, data: {} });
      return link?.token ?? null;
    }),

  /** RF-M5-06 / RF-M5-07 — visões consolidadas. */
  overview: (input: { months?: number } = {}) =>
    read((db, me) => {
      if (access(me, "receivables") !== "T") throw new ApiError(403, "Sem acesso ao financeiro consolidado.");
      const months = input.months ?? 6;
      const now = new Date();
      const keys = Array.from({ length: months * 2 }, (_, i) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1 + i, 1));
        return d.toISOString().slice(0, 7);
      });
      const recs = db.receivables.filter((r) => !r.deletedAt && r.status !== "cancelado").map((r) => ({ ...r, status: effectiveReceivableStatus(r) }));
      const pays = db.payables.filter((p) => !p.deletedAt && p.status !== "cancelado");
      const byMonth = keys.map((k) => ({
        month: k,
        previsto: recs.filter((r) => r.expectedAt.slice(0, 7) === k).reduce((a, r) => a + r.amountCents, 0),
        faturado: recs.filter((r) => r.issuedAt?.slice(0, 7) === k).reduce((a, r) => a + r.amountCents, 0),
        recebido: recs.filter((r) => r.receivedAt?.slice(0, 7) === k).reduce((a, r) => a + r.amountCents, 0),
        pagar: pays.filter((p) => p.dueAt.slice(0, 7) === k).reduce((a, p) => a + (p.invoicedAmountCents ?? p.agreedAmountCents), 0),
        pago: pays.filter((p) => p.paidAt?.slice(0, 7) === k).reduce((a, p) => a + (p.invoicedAmountCents ?? p.agreedAmountCents), 0),
      }));
      const projects = db.projects.filter((p) => !p.deletedAt && p.contractedAmountCents);
      const fin = projects.map((p) => ({ p, f: computeFinancials(db, p.id) }));
      const group = <K extends string>(keyOf: (p: (typeof projects)[number]) => K, labelOf: (k: K) => string) => {
        const map = new Map<K, { key: K; label: string; contracted: number; received: number; margin: number; projects: number }>();
        for (const { p, f } of fin) {
          const k = keyOf(p);
          const row = map.get(k) ?? { key: k, label: labelOf(k), contracted: 0, received: 0, margin: 0, projects: 0 };
          row.contracted += f.contractedCents;
          row.received += f.receivedCents;
          row.margin += f.marginCents;
          row.projects += 1;
          map.set(k, row);
        }
        return [...map.values()].sort((a, b) => b.contracted - a.contracted);
      };
      const thisMonth = now.toISOString().slice(0, 7);
      return {
        totals: {
          toReceive: recs.filter((r) => r.status !== "recebido").reduce((a, r) => a + r.amountCents, 0),
          overdue: recs.filter((r) => r.status === "vencido").reduce((a, r) => a + r.amountCents, 0),
          receivedMonth: recs.filter((r) => r.receivedAt?.slice(0, 7) === thisMonth).reduce((a, r) => a + r.amountCents, 0),
          toPay: pays.filter((p) => p.status !== "pago").reduce((a, p) => a + (p.invoicedAmountCents ?? p.agreedAmountCents), 0),
          toPayMonth: pays.filter((p) => p.status !== "pago" && p.dueAt.slice(0, 7) === thisMonth).reduce((a, p) => a + (p.invoicedAmountCents ?? p.agreedAmountCents), 0),
          awaitingInvoice: pays.filter((p) => p.status === "aguardando_nf").length,
          divergent: pays.filter((p) => p.status === "divergente").length,
          contracted: fin.reduce((a, x) => a + x.f.contractedCents, 0),
          margin: fin.reduce((a, x) => a + x.f.marginCents, 0),
        },
        byMonth,
        byClient: group((p) => p.clientId, (k) => db.clients.find((c) => c.id === k)?.tradeName ?? "—").slice(0, 10),
        byType: group((p) => p.projectTypeId, (k) => db.projectTypes.find((t) => t.id === k)?.name ?? "—"),
        projects: fin
          .map(({ p, f }) => ({ ...f, code: p.code, title: p.title, status: p.status, clientName: db.clients.find((c) => c.id === p.clientId)?.tradeName ?? "" }))
          .sort((a, b) => b.contractedCents - a.contractedCents),
      };
    }),
};

/* ───────── Formulário público de NF (RF-M5-04) — sem sessão ───────── */
export const publicInvoiceApi = {
  get: async (token: string) => {
    await latency();
    const db = loadDb();
    const link = db.shareLinks.find((s) => s.token === token && s.purpose === "nf_freelancer");
    if (!link) throw new ApiError(404, "Link inválido.");
    if (link.revokedAt) throw new ApiError(409, "Este link foi revogado. Peça um novo à Draw.");
    if (new Date(link.expiresAt).getTime() < Date.now()) throw new ApiError(409, "Este link expirou. Peça um novo à Draw.");
    const pay = db.payables.find((p) => p.id === link.targetId)!;
    const req = db.freelancerInvoiceRequests.find((r) => r.shareLinkId === link.id)!;
    const fl = db.freelancers.find((f) => f.id === pay.freelancerId)!;
    const p = db.projects.find((x) => x.id === pay.projectId)!;
    return structuredClone({
      projectCode: p.code,
      projectTitle: p.title,
      description: pay.description,
      agreedAmountCents: pay.agreedAmountCents,
      dueAt: pay.dueAt,
      status: pay.status,
      submittedAt: req.submittedAt,
      /** RN-42 — a Draw pediu nova NF: o formulário volta a aceitar envio e mostra o motivo. */
      reissueReason: pay.status === "aguardando_nf" ? (req.reissueReason ?? null) : null,
      reissueRequestedAt: pay.status === "aguardando_nf" ? (req.reissueRequestedAt ?? null) : null,
      expiresAt: link.expiresAt,
      // RN-48 — quem tem o link não vê CPF/CNPJ nem PIX completos, nem dados bancários: só os 4 últimos dígitos
      freelancer: { name: fl.name, legalName: fl.legalName, documentMasked: maskTail(fl.document), pixKeyMasked: maskTail(fl.pixKey), hasDocument: !!fl.document, hasPixKey: !!fl.pixKey },
      financeContact: financeContactOf(db),
    });
  },

  submit: async (token: string, input: { legalName: string; document: string; pixKey: string; invoiceNumber: string; amountCents: number; fileName: string; fileSize: number; dataUrl: string | null }) => {
    await latency(400);
    return transaction((db) => {
      const link = db.shareLinks.find((s) => s.token === token && s.purpose === "nf_freelancer");
      if (!link || link.revokedAt || new Date(link.expiresAt).getTime() < Date.now()) throw new ApiError(409, "Este link não é mais válido.");
      if (link.maxUses && link.useCount >= link.maxUses) throw new ApiError(409, "Limite de envios atingido. Fale com a Draw.");
      const payFl = db.freelancers.find((f) => f.id === db.payables.find((p) => p.id === link.targetId)?.freelancerId);
      // RN-48 — em branco = mantém o que está no cadastro (o link não mostra o dado completo)
      const document = input.document.trim() || payFl?.document || "";
      const pixKey = input.pixKey.trim() || payFl?.pixKey || "";
      const errors: Record<string, string> = {};
      if (!input.legalName.trim()) errors.legalName = "Informe a razão social ou nome";
      if (!document) errors.document = "Informe CPF ou CNPJ";
      if (!pixKey) errors.pixKey = "Informe a chave PIX para o pagamento";
      if (!input.invoiceNumber.trim()) errors.invoiceNumber = "Informe o número da NF";
      if (input.amountCents <= 0) errors.amountCents = "Informe o valor da NF";
      if (!input.fileName) errors.file = "Anexe o PDF da nota fiscal";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const pay = db.payables.find((p) => p.id === link.targetId)!;
      const req = db.freelancerInvoiceRequests.find((r) => r.shareLinkId === link.id)!;
      const p = db.projects.find((x) => x.id === pay.projectId)!;
      // só aceita envio enquanto aguarda NF (inclusive depois de um pedido de nova NF — RN-42)
      if (pay.status !== "aguardando_nf") throw new ApiError(409, "Esta nota já foi enviada e está com a equipe financeira da Draw.");
      const fileId = `file_${Date.now().toString(36)}`;
      const versionId = `fv_${Date.now().toString(36)}`;
      db.fileVersions.push({ ...baseFields(null), id: versionId, fileId, version: 1, storageKey: `org_draw/${p.id}/${fileId}/v1`, size: input.fileSize, mime: "application/pdf", sha256: Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""), uploadedBy: "public", note: "Enviado pelo formulário público", dataUrl: input.dataUrl });
      db.files.push({ ...baseFields(null), id: fileId, projectId: p.id, clientId: p.clientId, module: "projeto", taskId: null, category: "nf", name: input.fileName, currentVersionId: versionId, releasedToFreelancers: false, folderId: null });
      pay.invoicedAmountCents = input.amountCents;
      pay.invoiceNumber = input.invoiceNumber.trim();
      pay.invoiceFileId = fileId;
      // RN-04
      const status = applyInvoiceAmount(pay, input.amountCents);
      touch(pay);
      Object.assign(req, { submittedAt: nowIso(), declaredLegalName: input.legalName, declaredDocument: document, declaredPixKey: pixKey, declaredInvoiceNumber: input.invoiceNumber, declaredAmountCents: input.amountCents, source: "formulario" });
      link.useCount += 1;
      emit(db, null, { type: "payable.invoice_submitted", entityType: "payable", entityId: pay.id, project: p, data: { amountCents: input.amountCents, divergent: status === "divergente" } });
      // RN-46 — só o Financeiro envolvido (da equipe do projeto; senão, o perfil Financeiro; sem ninguém, a administração)
      notifyMany(db, null, financeAudience(db, p), { type: "nf_recebida", title: status === "divergente" ? "NF divergente recebida" : "NF recebida de freelancer", project: p, entityType: "payable", entityId: pay.id });
      return { status };
    });
  },
};
