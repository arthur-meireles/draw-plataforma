/**
 * RN-68 — cancelar projeto não deixa financeiro órfão em silêncio: o diálogo mostra o que fica em aberto (NF emitida
 * sem baixa, contas a pagar não pagas) e o Financeiro envolvido é avisado para decidir (cancelar NF — RN-47 — ou
 * cobrar; pagar ou recusar NF). Previstos continuam sendo cancelados automaticamente.
 */
import type { Database, ID, Project, User } from "../types";
import { assertProjectVisible, read } from "./_core";
import { notifyMany } from "./audience";
import { effectiveReceivableStatus, financeAudience } from "./finance-rules";
import { canSeeMoney } from "@/lib/permissions";

export function cancellationImpact(db: Database, p: Project) {
  const recs = db.receivables.filter((r) => r.projectId === p.id && !r.deletedAt && r.status !== "cancelado" && r.status !== "recebido");
  const toCancel = recs.filter((r) => !r.issuedAt);
  const invoiced = recs.filter((r) => !!r.issuedAt);
  const payables = db.payables.filter((x) => x.projectId === p.id && !x.deletedAt && x.status !== "pago" && x.status !== "cancelado");
  return {
    receivablesToCancel: toCancel.length,
    receivablesToCancelCents: toCancel.reduce((a, r) => a + r.amountCents, 0),
    invoicedOpen: invoiced.map((r) => ({ id: r.id, description: r.description, invoiceNumber: r.invoiceNumber, amountCents: r.amountCents, overdue: effectiveReceivableStatus(r) === "vencido" })),
    openPayables: payables.map((x) => ({ id: x.id, description: x.description, status: x.status, amountCents: x.invoicedAmountCents ?? x.agreedAmountCents, freelancerName: x.freelancerId ? (db.freelancers.find((f) => f.id === x.freelancerId)?.name ?? null) : null })),
  };
}

/** Chamado por `projectsApi.cancel` depois de cancelar: avisa o Financeiro envolvido quando sobra pendência. */
export function notifyCancellationPending(db: Database, me: User, p: Project, impact: ReturnType<typeof cancellationImpact>) {
  const n = impact.invoicedOpen.length + impact.openPayables.length;
  if (!n) return;
  const parts = [impact.invoicedOpen.length ? `${impact.invoicedOpen.length} NF(s) emitida(s) sem baixa` : null, impact.openPayables.length ? `${impact.openPayables.length} conta(s) a pagar em aberto` : null].filter(Boolean);
  notifyMany(db, me, financeAudience(db, p), { type: "projeto", title: "Projeto cancelado com pendências financeiras", body: `${parts.join(" e ")}: decida cobrar, cancelar a NF ou pagar.`, project: p });
}

export const projectFinanceImpactApi = {
  /** Prévia do diálogo "Cancelar projeto" (valores só para quem vê valores). */
  cancellationImpact: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      const impact = cancellationImpact(db, p);
      if (canSeeMoney(me)) return impact;
      return { ...impact, receivablesToCancelCents: null, invoicedOpen: impact.invoicedOpen.map((r) => ({ ...r, amountCents: null })), openPayables: impact.openPayables.map((x) => ({ ...x, amountCents: null })) };
    }, 60),
};
