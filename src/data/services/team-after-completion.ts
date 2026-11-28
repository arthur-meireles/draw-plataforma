/**
 * RN-70 — equipe alterada depois da conclusão. A conclusão gera os pagáveis uma vez só (RN-03/RN-40); quem entra
 * ou muda de valor depois não pode ficar sem pagamento em silêncio:
 *  - freelancer sem conta a pagar → sugere gerar o pagamento (RN-43) e avisa quem cuida de contas a pagar;
 *  - pagável ainda `aguardando_nf` → o valor acompanha o novo acordado (evento antes/depois, RN-09);
 *  - pagável já com NF/pago e valor maior → sugere pagamento adicional da diferença.
 */
import type { Database, Project, ProjectMember, User } from "../types";
import { emitValueChange, touch } from "./_core";
import { notifyMany } from "./audience";
import { canWriteAll } from "@/lib/permissions";

export interface PaymentSuggestion {
  memberId: string;
  name: string;
  amountCents: number;
  additional: boolean;
}

export function afterCompletionTeamChange(db: Database, me: User, p: Project, m: ProjectMember, beforeAmount: number | null): PaymentSuggestion | null {
  if (p.status !== "concluido" || !m.freelancerId || !m.active || !(m.agreedAmountCents && m.agreedAmountCents > 0) || m.paymentWaived) return null;
  const name = db.freelancers.find((f) => f.id === m.freelancerId)?.name ?? "Freelancer";
  const pays = db.payables.filter((x) => x.projectMemberId === m.id && !x.deletedAt && x.status !== "cancelado");
  let suggestion: PaymentSuggestion | null = null;
  if (!pays.length) suggestion = { memberId: m.id, name, amountCents: m.agreedAmountCents, additional: false };
  else if (beforeAmount !== m.agreedAmountCents) {
    const waiting = pays.find((x) => x.status === "aguardando_nf");
    if (waiting && pays.length === 1) {
      emitValueChange(db, me, "payable", waiting.id, p, "agreedAmountCents", waiting.agreedAmountCents, m.agreedAmountCents);
      waiting.agreedAmountCents = m.agreedAmountCents;
      touch(waiting);
    } else {
      const paid = pays.reduce((a, x) => a + (x.invoicedAmountCents ?? x.agreedAmountCents), 0);
      if (m.agreedAmountCents > paid) suggestion = { memberId: m.id, name, amountCents: m.agreedAmountCents - paid, additional: true };
    }
  }
  if (suggestion) {
    const payablesTeam = db.users.filter((u) => u.status === "ativo" && canWriteAll(u, "payables")).map((u) => u.id);
    notifyMany(db, me, payablesTeam, {
      type: "projeto",
      title: suggestion.additional ? "Valor de freelancer aumentou depois da conclusão" : "Freelancer entrou depois da conclusão",
      body: `${name}: gere o pagamento ${suggestion.additional ? "adicional " : ""}na aba Equipe ou em A pagar`,
      project: p,
    });
  }
  return suggestion;
}
