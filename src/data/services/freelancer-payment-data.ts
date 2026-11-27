/**
 * RN-48 — dados de pagamento do freelancer no contas a pagar: o que ele declarou no envio da NF, o que está no cadastro,
 * as diferenças e a ação "Atualizar cadastro com estes dados". Só para quem tem `freelancerBank = T`.
 */
import type { Database, ID, User } from "../types";
import { ApiError, emit, read, requireAccess, touch, write } from "./_core";
import { maskTail } from "./finance-rules";
import { onlyDigits } from "@/lib/format";

type Field = "legalName" | "document" | "pixKey";
const LABEL: Record<Field, string> = { legalName: "Razão social / nome", document: "CPF / CNPJ", pixKey: "Chave PIX" };

function load(db: Database, me: User, payableId: ID) {
  requireAccess(me, "freelancerBank", "all", "Seu perfil não vê dados bancários de freelancers. Peça ao Financeiro.");
  const pay = db.payables.find((p) => p.id === payableId && !p.deletedAt);
  if (!pay) throw new ApiError(404, "Lançamento não encontrado.");
  if (pay.kind !== "freelancer" || !pay.freelancerId) throw new ApiError(409, "Só contas de freelancer têm dados de pagamento do favorecido.");
  const fl = db.freelancers.find((f) => f.id === pay.freelancerId);
  if (!fl) throw new ApiError(404, "Freelancer não encontrado.");
  const req = db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id) ?? null;
  return { pay, fl, req };
}

const same = (f: Field, a: string | null | undefined, b: string | null | undefined) =>
  f === "document" ? onlyDigits(a ?? "") === onlyDigits(b ?? "") : (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export const freelancerPaymentDataApi = {
  /** Favorecido do pagamento (cadastro) + dados declarados na NF e quais campos diferem do cadastro. */
  get: (payableId: ID) =>
    read((db, me) => {
      const { fl, req } = load(db, me, payableId);
      const declared = { legalName: req?.declaredLegalName ?? null, document: req?.declaredDocument ?? null, pixKey: req?.declaredPixKey ?? null };
      const record = { legalName: fl.legalName ?? fl.name, document: fl.document, pixKey: fl.pixKey };
      const differs = (Object.keys(LABEL) as Field[]).filter((f) => declared[f] && !same(f, declared[f], record[f]));
      return {
        freelancerId: fl.id,
        name: fl.name,
        email: fl.email,
        ...record,
        bankName: fl.bankName,
        bankAgency: fl.bankAgency,
        bankAccount: fl.bankAccount,
        declared,
        submittedAt: req?.submittedAt ?? null,
        differs: differs.map((f) => ({ field: f, label: LABEL[f] })),
      };
    }),

  /** "Atualizar cadastro com estes dados" — copia o declarado (só campos que diferem) para o cadastro, com antes/depois mascarado. */
  applyDeclared: (payableId: ID) =>
    write((db, me) => {
      const { fl, req } = load(db, me, payableId);
      requireAccess(me, "freelancers", "all", "Seu perfil não altera o cadastro de freelancers.");
      if (!req?.submittedAt) throw new ApiError(409, "O freelancer ainda não enviou dados com a NF.");
      const changes: { field: Field; before: string | null; after: string | null }[] = [];
      const declared: Record<Field, string | null> = { legalName: req.declaredLegalName, document: req.declaredDocument, pixKey: req.declaredPixKey };
      for (const f of Object.keys(LABEL) as Field[]) {
        const v = declared[f]?.trim();
        if (!v) continue;
        const current = f === "legalName" ? fl.legalName : fl[f];
        if (same(f, v, current)) continue;
        changes.push({ field: f, before: f === "legalName" ? current : maskTail(current), after: f === "legalName" ? v : maskTail(v) });
        if (f === "legalName") fl.legalName = v;
        else fl[f] = v;
      }
      if (!changes.length) throw new ApiError(409, "O cadastro já está com os dados declarados.");
      touch(fl);
      emit(db, me, { type: "freelancer.payment_data_updated", entityType: "freelancer", entityId: fl.id, data: { source: "nf_declarada", payableId, changes } });
      return { updated: changes.map((c) => LABEL[c.field]) };
    }),
};
