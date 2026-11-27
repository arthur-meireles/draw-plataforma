/**
 * Área do freelancer — os próprios dados (RN-39). O freelancer com acesso mantém telefone, razão social/nome para NF,
 * CPF/CNPJ, chave PIX e banco do PRÓPRIO cadastro (recurso `freelancerBank` = P). Toda mudança de dado de pagamento
 * fica no histórico (`freelancer.bank_data_changed`, só os campos — nunca os valores), na trilha de segurança e avisa o
 * Financeiro na Caixa de entrada (tipo `cadastro`).
 */
import type { Freelancer } from "../types";
import { ApiError, emit, freelancerIdOf, read, touch, write } from "./_core";
import { notifyMany } from "./audience";
import { securityLog } from "./users-extra";
import { canWriteAll } from "@/lib/permissions";
import { onlyDigits } from "@/lib/format";

export interface MyFreelancerDataInput {
  phone: string | null;
  legalName: string | null;
  document: string | null;
  pixKey: string | null;
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
}

const PAYMENT_FIELDS = ["legalName", "document", "pixKey", "bankName", "bankAgency", "bankAccount"] as const;
const FIELD_LABEL: Record<(typeof PAYMENT_FIELDS)[number] | "phone", string> = { phone: "telefone", legalName: "nome para NF", document: "CPF/CNPJ", pixKey: "chave PIX", bankName: "banco", bankAgency: "agência", bankAccount: "conta" };

const pick = (f: Freelancer) => ({ id: f.id, name: f.name, email: f.email, phone: f.phone, legalName: f.legalName, document: f.document, pixKey: f.pixKey, bankName: f.bankName, bankAgency: f.bankAgency, bankAccount: f.bankAccount, jobTitle: f.jobTitle, updatedAt: f.updatedAt });

export const freelancerSelfApi = {
  /** `GET /me/freelancer` — o cadastro de freelancer de quem está logado (com dados bancários: são dele). */
  myData: () =>
    read((db, me) => {
      const id = freelancerIdOf(db, me);
      const f = id ? db.freelancers.find((x) => x.id === id && !x.deletedAt) : null;
      if (me.role !== "freelancer" || !f) throw new ApiError(404, "Seu acesso não está ligado a um cadastro de freelancer. Fale com o Financeiro da Draw.");
      return pick(f);
    }, 80),

  /** `PATCH /me/freelancer` — RN-39. */
  updateMyData: (input: MyFreelancerDataInput) =>
    write((db, me) => {
      const id = freelancerIdOf(db, me);
      const f = id ? db.freelancers.find((x) => x.id === id && !x.deletedAt) : null;
      if (me.role !== "freelancer" || !f) throw new ApiError(403, "Só o próprio freelancer altera estes dados por aqui. O Financeiro altera em Cadastros › Freelancers.");
      const clean = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : null])) as unknown as MyFreelancerDataInput;
      const errors: Record<string, string> = {};
      if (clean.phone && onlyDigits(clean.phone).length < 10) errors.phone = "Use DDD + número";
      if (clean.document && ![11, 14].includes(onlyDigits(clean.document).length)) errors.document = "CPF com 11 dígitos ou CNPJ com 14";
      if (!clean.pixKey && !(clean.bankName && clean.bankAgency && clean.bankAccount)) errors.pixKey = "Informe a chave PIX ou banco, agência e conta";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);

      const changed = (["phone", ...PAYMENT_FIELDS] as const).filter((k) => (f[k] ?? null) !== (clean[k] ?? null));
      if (!changed.length) return pick(f);
      Object.assign(f, clean);
      touch(f);
      const payment = changed.filter((k) => k !== "phone");
      const labels = changed.map((k) => FIELD_LABEL[k]);
      emit(db, me, { type: payment.length ? "freelancer.bank_data_changed" : "freelancer.updated", entityType: "freelancer", entityId: f.id, data: { fields: changed, by: "freelancer" } });
      if (payment.length) {
        securityLog(db, me.id, "bank_data_changed", `${f.name}: ${payment.map((k) => FIELD_LABEL[k]).join(", ")}`);
        const finance = db.users.filter((u) => u.status === "ativo" && !u.deletedAt && u.role === "financeiro").map((u) => u.id);
        const to = finance.length ? finance : db.users.filter((u) => u.status === "ativo" && !u.deletedAt && canWriteAll(u, "payables") && u.role !== "freelancer").map((u) => u.id);
        notifyMany(db, me, to, { type: "cadastro", title: `${f.name} atualizou os dados de pagamento`, body: `Mudou: ${labels.join(", ")}. Confira antes do próximo pagamento.`, entityType: "freelancer", entityId: f.id });
      }
      return pick(f);
    }),
};
