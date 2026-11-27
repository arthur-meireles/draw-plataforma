/**
 * RN-67 — cobrança ao cliente sem e-mail interno: o sistema monta a mensagem de cobrança pronta para copiar
 * (destinatário = contato de cobrança do projeto/cliente) e o Financeiro registra que a enviou pelo próprio canal.
 */
import type { ID } from "../types";
import { ApiError, emit, read, requireAccess, touch, write } from "./_core";
import { effectiveReceivableStatus, financeContactOf } from "./finance-rules";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export type CollectionChannel = "email" | "whatsapp" | "telefone" | "outro";
const CHANNEL_LABEL: Record<CollectionChannel, string> = { email: "e-mail", whatsapp: "WhatsApp", telefone: "telefone", outro: "outro canal" };

export const collectionApi = {
  /** Mensagem de cobrança pronta (assunto + texto) e o contato de cobrança para colar no e-mail/WhatsApp. */
  message: (receivableId: ID) =>
    read((db, me) => {
      requireAccess(me, "receivables", "all", "Só o Financeiro e a administração fazem cobranças.");
      const r = db.receivables.find((x) => x.id === receivableId && !x.deletedAt);
      if (!r) throw new ApiError(404, "Lançamento não encontrado.");
      const p = db.projects.find((x) => x.id === r.projectId)!;
      const c = db.clients.find((x) => x.id === r.clientId)!;
      const contact =
        db.clientContacts.find((k) => k.id === p.billingContactId && !k.deletedAt) ?? db.clientContacts.find((k) => k.clientId === c.id && k.isBillingContact && !k.deletedAt) ?? null;
      const status = effectiveReceivableStatus(r);
      const fin = financeContactOf(db);
      const nf = r.invoiceNumber ? `NF nº ${r.invoiceNumber}${r.issuedAt ? `, emitida em ${day(r.issuedAt)}` : ""}` : "cobrança";
      const subject = `${status === "vencido" ? "Lembrete de pagamento" : "Cobrança"} — ${r.invoiceNumber ? `NF ${r.invoiceNumber} · ` : ""}${p.code} ${p.title}`;
      const greeting = contact ? `Olá, ${contact.name.split(" ")[0]}!` : "Olá!";
      const lines = [
        greeting,
        "",
        status === "vencido"
          ? `Identificamos que a ${nf}, no valor de ${brl(r.amountCents)}, referente a "${r.description}" do projeto ${p.code} — ${p.title}, venceu em ${day(r.expectedAt)} e ainda não consta como paga.`
          : `Segue a ${nf}, no valor de ${brl(r.amountCents)}, referente a "${r.description}" do projeto ${p.code} — ${p.title}, com vencimento em ${day(r.expectedAt)}.`,
        c.paymentTermsNote ? `Condição combinada: ${c.paymentTermsNote.replace(/[.\s]+$/, "")}.` : null,
        status === "vencido" ? "Se o pagamento já foi feito, pode desconsiderar esta mensagem e, se possível, nos envie o comprovante." : null,
        "",
        `Qualquer dúvida, fale com o Financeiro da Draw${fin.email ? `: ${fin.email}` : ""}${fin.phone ? ` · ${fin.phone}` : ""}.`,
        "",
        "Obrigado!",
        "Equipe Draw",
      ].filter((l): l is string => l !== null);
      return {
        to: contact ? { name: contact.name, email: contact.email, phone: contact.phone } : null,
        clientName: c.tradeName,
        subject,
        body: lines.join("\n"),
        overdue: status === "vencido",
        hasInvoice: !!r.issuedAt,
      };
    }, 60),

  /** Registra a cobrança enviada (data, canal, para quem) na nota de cobrança e no histórico. */
  registerSent: (receivableId: ID, input: { channel: CollectionChannel; note?: string | null }) =>
    write((db, me) => {
      requireAccess(me, "receivables", "all", "Só o Financeiro e a administração fazem cobranças.");
      const r = db.receivables.find((x) => x.id === receivableId && !x.deletedAt);
      if (!r) throw new ApiError(404, "Lançamento não encontrado.");
      if (r.status === "recebido" || r.status === "cancelado") throw new ApiError(409, "Este lançamento já está encerrado; não há o que cobrar.");
      if (!CHANNEL_LABEL[input.channel]) throw new ApiError(422, "Escolha o canal usado.", { channel: "Escolha o canal" });
      const p = db.projects.find((x) => x.id === r.projectId) ?? null;
      const contact = p ? db.clientContacts.find((k) => k.id === p.billingContactId && !k.deletedAt) : null;
      const line = `${day(new Date().toISOString())} — cobrança enviada por ${CHANNEL_LABEL[input.channel]}${contact ? ` para ${contact.name}` : ""}${input.note?.trim() ? `: ${input.note.trim()}` : ""} (${me.name})`;
      r.collectionNote = r.collectionNote ? `${line}\n${r.collectionNote}` : line;
      touch(r);
      emit(db, me, { type: "receivable.collection_sent", entityType: "receivable", entityId: r.id, project: p, data: { channel: input.channel, to: contact?.email ?? null, note: input.note?.trim() || null } });
      return r;
    }),
};
