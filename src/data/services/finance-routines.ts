/**
 * Rotina diária do financeiro (RN-46) — no back-end é um job agendado (uma vez por dia); no front local roda
 * quando a sessão abre (`routinesApi.runDaily`). É idempotente: cada alerta é registrado como evento e não se repete.
 *  - recebível vencido → Financeiro envolvido + responsável do projeto (`vencimento`);
 *  - recebível a vencer em `dueSoonDays` → Financeiro envolvido (`vencimento`);
 *  - NF de freelancer pendente a 7 dias (ou menos) do vencimento do pagamento → lembrete ao freelancer
 *    (e-mail transacional externo + Caixa de entrada se tiver login) e alerta ao Financeiro envolvido.
 */
import type { Database, ID, User } from "../types";
import { emit, queueSystemEmail, write } from "./_core";
import { notifyMany } from "./audience";
import { effectiveReceivableStatus, financeAudience } from "./finance-rules";

const DAY = 86_400_000;
/** Antecedência do lembrete de NF pendente ao freelancer. */
export const INVOICE_REMINDER_DAYS = 7;

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const alerted = (db: Database, entityId: ID, type: string) => db.events.some((e) => e.entityId === entityId && e.type === type);

export function runFinanceRoutines(db: Database, now: number = Date.now(), me: User | null = null) {
  const soonDays = db.organizations[0]?.settings.dueSoonDays ?? 2;
  let alerts = 0;
  for (const r of db.receivables) {
    if (r.deletedAt || r.status === "cancelado" || r.status === "recebido") continue;
    const p = db.projects.find((x) => x.id === r.projectId);
    if (!p || p.deletedAt) continue;
    const status = effectiveReceivableStatus(r, now);
    const due = new Date(r.expectedAt).getTime();
    if (status === "vencido") {
      if (alerted(db, r.id, "receivable.overdue_alerted")) continue;
      notifyMany(db, me, [...financeAudience(db, p), p.ownerId], {
        type: "vencimento",
        title: r.issuedAt ? "Cobrança vencida" : "Recebível vencido sem NF emitida",
        body: `${r.description} · ${brl(r.amountCents)}`,
        project: p,
        entityType: "receivable",
        entityId: r.id,
      });
      emit(db, null, { type: "receivable.overdue_alerted", entityType: "receivable", entityId: r.id, project: p, data: { expectedAt: r.expectedAt } });
      alerts++;
    } else if (due >= now && due <= now + soonDays * DAY) {
      if (alerted(db, r.id, "receivable.due_soon_alerted")) continue;
      notifyMany(db, me, financeAudience(db, p), {
        type: "vencimento",
        title: r.issuedAt ? `Cobrança vence em até ${soonDays} dias` : `Recebível vence em até ${soonDays} dias e ainda não tem NF`,
        body: `${r.description} · ${brl(r.amountCents)}`,
        project: p,
        entityType: "receivable",
        entityId: r.id,
      });
      emit(db, null, { type: "receivable.due_soon_alerted", entityType: "receivable", entityId: r.id, project: p, data: { expectedAt: r.expectedAt } });
      alerts++;
    }
  }
  for (const pay of db.payables) {
    if (pay.deletedAt || pay.kind !== "freelancer" || pay.status !== "aguardando_nf") continue;
    const due = new Date(pay.dueAt).getTime();
    if (due > now + INVOICE_REMINDER_DAYS * DAY) continue;
    if (alerted(db, pay.id, "payable.invoice_reminder_sent")) continue;
    const p = pay.projectId ? (db.projects.find((x) => x.id === pay.projectId) ?? null) : null;
    const fl = db.freelancers.find((f) => f.id === pay.freelancerId);
    if (fl?.email) queueSystemEmail(db, { to: [fl.email], subject: `Lembrete: envie sua nota fiscal${p ? ` — ${p.code}` : ""}`, template: "nf_freelancer_lembrete", projectId: pay.projectId });
    notifyMany(db, me, [fl?.userId], { type: "nf_solicitada", title: "Lembrete: envie sua nota fiscal", body: `O pagamento vence em ${new Date(pay.dueAt).toLocaleDateString("pt-BR")}`, project: p, entityType: "payable", entityId: pay.id });
    notifyMany(db, me, financeAudience(db, p), { type: "vencimento", title: `NF pendente de ${fl?.name ?? "freelancer"} perto do vencimento`, body: pay.description, project: p, entityType: "payable", entityId: pay.id });
    emit(db, null, { type: "payable.invoice_reminder_sent", entityType: "payable", entityId: pay.id, project: p, data: { dueAt: pay.dueAt, emailed: !!fl?.email } });
    alerts++;
  }
  return { alerts };
}

export const routinesApi = {
  /** Mock do job diário (back-end: agendador, ator = sistema). Qualquer sessão dispara; só cria o que ainda não foi avisado. */
  runDaily: () => write((db) => runFinanceRoutines(db), 40),
};
