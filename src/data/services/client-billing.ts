/**
 * RN-49 — dados de cobrança do cliente: política/prazo de pagamento e contato de cobrança. Além de quem mantém o
 * cadastro (`clients = T`), o Financeiro (`receivables = T`) edita **só** estes campos. Remover/trocar o contato de
 * cobrança nunca deixa projeto apontando para contato excluído.
 */
import { baseFields, nowIso } from "../db";
import type { ClientContact, Database, ID, User } from "../types";
import { ApiError, emit, touch, write } from "./_core";
import { canWriteAll } from "@/lib/permissions";

const OPEN = new Set(["cotacao", "ativo"]);

function requireBilling(me: User) {
  if (canWriteAll(me, "clients") || canWriteAll(me, "receivables")) return;
  throw new ApiError(403, "Seu perfil só consulta os dados de cobrança do cliente. Peça ao Financeiro ou ao Comercial.");
}

/** Projetos em aberto do cliente passam a usar o novo contato de cobrança (os que usavam o antigo ou nenhum). */
function repointOpenProjects(db: Database, me: User, clientId: ID, from: ID | null, to: ID) {
  let n = 0;
  for (const p of db.projects) {
    if (p.clientId !== clientId || p.deletedAt || !OPEN.has(p.status)) continue;
    if (p.billingContactId && p.billingContactId !== from) continue;
    if (p.billingContactId === to) continue;
    p.billingContactId = to;
    touch(p);
    n++;
  }
  if (n) emit(db, me, { type: "client.billing_contact_applied", entityType: "client", entityId: clientId, data: { from, to, projects: n } });
  return n;
}

export type ContactInput = Omit<ClientContact, keyof ReturnType<typeof baseFields> | "clientId">;

export const clientBillingApi = {
  /** Política (texto) e prazo em dias após o gatilho (RN-45). */
  updateTerms: (clientId: ID, input: { paymentTermsNote: string | null; paymentTermDays: number | null }) =>
    write((db, me) => {
      requireBilling(me);
      const c = db.clients.find((x) => x.id === clientId && !x.deletedAt);
      if (!c) throw new ApiError(404, "Cliente não encontrado.");
      const days = input.paymentTermDays;
      if (days != null && (!Number.isInteger(days) || days < 0 || days > 365)) throw new ApiError(422, "Informe o prazo em dias, de 0 a 365.", { paymentTermDays: "Use um número inteiro de 0 a 365" });
      const before = { paymentTermsNote: c.paymentTermsNote, paymentTermDays: c.paymentTermDays };
      c.paymentTermsNote = input.paymentTermsNote?.trim() || null;
      c.paymentTermDays = days;
      touch(c);
      emit(db, me, { type: "client.billing_terms_updated", entityType: "client", entityId: c.id, data: { before, after: { paymentTermsNote: c.paymentTermsNote, paymentTermDays: c.paymentTermDays } } });
      return c;
    }),

  /**
   * Cria/edita contato. O Financeiro (sem `clients = T`) só mexe em contato de cobrança. Ao marcar um novo contato de
   * cobrança, os projetos em aberto que usavam o anterior (ou nenhum) passam para ele.
   */
  saveContact: (clientId: ID, input: ContactInput, id?: ID) =>
    write((db, me) => {
      requireBilling(me);
      const full = canWriteAll(me, "clients");
      if (!db.clients.some((c) => c.id === clientId && !c.deletedAt)) throw new ApiError(404, "Cliente não encontrado.");
      const existing = id ? db.clientContacts.find((c) => c.id === id && c.clientId === clientId && !c.deletedAt) : undefined;
      if (id && !existing) throw new ApiError(404, "Contato não encontrado neste cliente.");
      if (!full && (!input.isBillingContact || (existing && !existing.isBillingContact))) throw new ApiError(403, "O Financeiro cadastra e edita só o contato de cobrança. Para outros contatos, peça ao Comercial.");
      if (!input.name.trim()) throw new ApiError(422, "Informe o nome do contato.", { name: "Informe o nome do contato" });
      if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new ApiError(422, "E-mail inválido.", { email: "Informe um e-mail válido, ex.: nome@empresa.com.br" });
      const previousBilling = db.clientContacts.find((c) => c.clientId === clientId && c.isBillingContact && !c.deletedAt) ?? null;
      if (input.isBillingContact) db.clientContacts.filter((c) => c.clientId === clientId).forEach((c) => (c.isBillingContact = false));
      let c: ClientContact;
      if (existing) {
        Object.assign(existing, input);
        touch(existing);
        c = existing;
      } else {
        c = { ...baseFields(me.id), clientId, ...input };
        db.clientContacts.push(c);
      }
      if (c.isBillingContact && previousBilling?.id !== c.id) repointOpenProjects(db, me, clientId, previousBilling?.id ?? null, c.id);
      return c;
    }),

  /**
   * Remove contato. Se algum projeto aponta para ele: com outro contato no cliente, exige `replacementId` (que vira o
   * contato desses projetos e, se o removido era o de cobrança, o novo contato de cobrança); sem outro contato, os
   * projetos ficam sem contato de cobrança. Devolve quantos projetos foram ajustados.
   */
  removeContact: (id: ID, replacementId?: ID | null) =>
    write((db, me) => {
      const c = db.clientContacts.find((x) => x.id === id && !x.deletedAt);
      if (!c) throw new ApiError(404, "Contato não encontrado.");
      if (!canWriteAll(me, "clients") && !(c.isBillingContact && canWriteAll(me, "receivables"))) throw new ApiError(403, "Seu perfil não remove este contato. Peça ao Comercial.");
      const others = db.clientContacts.filter((x) => x.clientId === c.clientId && x.id !== c.id && !x.deletedAt);
      const projects = db.projects.filter((p) => p.billingContactId === c.id && !p.deletedAt);
      const replacement = replacementId ? others.find((x) => x.id === replacementId) : undefined;
      if (replacementId && !replacement) throw new ApiError(422, "Escolha outro contato deste cliente.", { replacementId: "Escolha outro contato deste cliente" });
      if ((projects.length || c.isBillingContact) && others.length && !replacement)
        throw new ApiError(422, `${c.isBillingContact ? "Este é o contato de cobrança" : "Este contato é usado"}${projects.length ? ` em ${projects.length} projeto(s)` : ""}. Escolha quem assume antes de remover.`, { replacementId: "Escolha quem assume a cobrança" });
      c.deletedAt = nowIso();
      if (replacement && c.isBillingContact) {
        db.clientContacts.filter((x) => x.clientId === c.clientId).forEach((x) => (x.isBillingContact = false));
        replacement.isBillingContact = true;
        touch(replacement);
      }
      c.isBillingContact = false;
      projects.forEach((p) => {
        p.billingContactId = replacement?.id ?? null;
        touch(p);
      });
      emit(db, me, { type: "client.contact_removed", entityType: "client", entityId: c.clientId, data: { contactId: c.id, name: c.name, replacementId: replacement?.id ?? null, projects: projects.length } });
      return { projectsUpdated: projects.length, replacementId: replacement?.id ?? null };
    }),
};
