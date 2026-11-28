/**
 * Entrada de projetos (onda 3, RN-95..RN-97): validação no serviço (não só no assistente), avisos da criação
 * direta, condição de pagamento derivada da proposta e recálculo da parcela "na entrega" quando o prazo muda.
 */
import { touch } from "./_core";
import type { Database, ID, PaymentCondition, Project, User } from "../types";
import { ApiError, emit, notify } from "./_core";
import { freelancerUserId, notifyMany } from "./audience";
import { financeAudience, installmentDue } from "./finance-rules";

/** RN-95 — cliente existente, tipo existente, título com 3+ caracteres e responsável interno ativo (422 com `fieldErrors`). */
export function newProjectErrors(db: Database, input: { clientId: ID; projectTypeId: ID; title: string; ownerId: ID }) {
  const errors: Record<string, string> = {};
  if (!input.clientId || !db.clients.some((c) => c.id === input.clientId && !c.deletedAt)) errors.clientId = "Escolha um cliente";
  if (!input.projectTypeId || !db.projectTypes.some((t) => t.id === input.projectTypeId)) errors.projectTypeId = "Escolha um tipo de projeto";
  if ((input.title ?? "").trim().length < 3) errors.title = "Dê um título com ao menos 3 caracteres";
  const owner = db.users.find((u) => u.id === input.ownerId);
  if (!owner || owner.status !== "ativo" || owner.role === "freelancer") errors.ownerId = "Escolha um responsável ativo da equipe interna";
  return errors;
}

export function validateNewProject(db: Database, input: { clientId: ID; projectTypeId: ID; title: string; ownerId: ID }) {
  const errors = newProjectErrors(db, input);
  if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
}

/** RN-96 — projeto direto avisa responsável, equipe (inclusive freelancer com acesso) e o Financeiro envolvido (recebíveis criados). */
export function notifyDirectCreated(db: Database, me: User, p: Project, installments: number) {
  const memberIds = db.projectMembers
    .filter((m) => m.projectId === p.id && m.active && !m.deletedAt)
    .map((m) => m.userId ?? freelancerUserId(db, m.freelancerId));
  notifyMany(db, me, [p.ownerId, ...memberIds], { type: "atribuicao", title: `Você foi incluído no projeto ${p.code}`, body: p.title, project: p });
  notifyMany(db, me, financeAudience(db, p), { type: "projeto", title: `Novo projeto direto: ${installments} recebível(is) previsto(s)`, body: p.title, project: p });
}

/** RN-97 — à vista (1 parcela), 50/50 (2 parcelas iguais) ou parcelado, a partir das parcelas da proposta. */
export function inferPaymentCondition(amounts: number[]): PaymentCondition | null {
  if (!amounts.length) return null;
  if (amounts.length === 1) return "a_vista";
  if (amounts.length === 2 && amounts[0] === amounts[1]) return "50_50";
  return "parcelado";
}

/**
 * RN-97 — parcelas "na entrega" (ou data "a partir do prazo") ainda `previsto` e sem data própria acompanham o prazo do projeto:
 * ao mudar `dueAt`, o vencimento é recalculado (prazo + prazo do cliente) e o evento guarda antes/depois.
 */
export function recomputeDeliveryDue(db: Database, me: User, p: Project) {
  const moved: { id: ID; from: string; to: string }[] = [];
  for (const r of db.receivables) {
    if (r.projectId !== p.id || r.deletedAt || r.status !== "previsto" || !r.proposalInstallmentId) continue;
    const inst = db.proposalInstallments.find((i) => i.id === r.proposalInstallmentId);
    if (!inst || inst.dueAt || inst.dueRule === "Na aprovação") continue;
    const due = installmentDue(db, p, inst, p.approvedAt ?? new Date().toISOString());
    if (due.expectedAt === r.expectedAt) continue;
    moved.push({ id: r.id, from: r.expectedAt, to: due.expectedAt });
    r.expectedAt = due.expectedAt;
    r.dueBasis = due.basis;
    touch(r);
  }
  if (moved.length) {
    emit(db, me, { type: "receivable.delivery_rescheduled", entityType: "project", entityId: p.id, project: p, data: { count: moved.length, receivables: moved } });
    notifyMany(db, me, financeAudience(db, p), { type: "projeto", title: `Prazo do projeto mudou: ${moved.length} vencimento(s) recalculado(s)`, project: p });
  }
  return moved.length;
}

/** Aviso ao responsável quando outra pessoa age na cotação dele (perda, reabertura, proposta enviada). */
export function notifyOwner(db: Database, me: User, p: Project, title: string, body?: string) {
  notify(db, me, { userId: p.ownerId, type: "projeto", title, body, project: p });
}

/** RN-98 — trocar o cliente (só pela API; a tela não oferece) leva junto os recebíveis previstos, o contato de faturamento e os arquivos. */
export function propagateClientChange(db: Database, p: Project) {
  db.receivables.filter((r) => r.projectId === p.id && !r.deletedAt && r.status === "previsto").forEach((r) => {
    r.clientId = p.clientId;
    touch(r);
  });
  db.files.filter((f) => f.projectId === p.id).forEach((f) => {
    f.clientId = p.clientId;
    touch(f);
  });
  p.billingContactId = db.clientContacts.find((c) => c.clientId === p.clientId && c.isBillingContact)?.id ?? null;
}
