/**
 * Financeiro, cadastros e painel — furos altos da onda 2: prazo do cliente (RN-45), vencido derivado e alertas (RN-45/46),
 * estornos (RN-47), dados do freelancer (RN-48), política de pagamento pelo Financeiro (RN-49), margem (RN-14/RN-65)
 * e indicadores com período e escopo (RN-66).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { financeApi, projectsApi, proposalsApi } from "./index";

const as = (userId: string) => setSessionUserId(userId);
const typeByPrefix = (p: string) => loadDb().projectTypes.find((t) => t.codePrefix === p)!;
const save = (db: ReturnType<typeof loadDb>) => window.localStorage.setItem("draw:db", JSON.stringify(db));
const DAY = 86_400_000;

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as("usr_paula");
});

/** Cliente com prazo de pagamento definido (dias após o gatilho). */
function clientWithTerm(days: number | null) {
  const db = loadDb();
  const c = db.clients.find((x) => !x.deletedAt)!;
  c.paymentTermDays = days;
  save(db);
  return c;
}

async function approvedWithInstallment(clientId: string, inst: { dueRule: string | null; dueAt: string | null }) {
  const p = await projectsApi.createQuote({ clientId, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: "usr_carlos" });
  const prop = await proposalsApi.create(p.id, { amountCents: 500_000, installments: [{ amountCents: 500_000, ...inst }] });
  await proposalsApi.send(prop.id);
  await proposalsApi.approve(prop.id);
  return loadDb().receivables.find((r) => r.projectId === p.id)!;
}

describe("RN-45 — prazo do cliente no vencimento", () => {
  it("parcela sem data usa aprovação + prazo do cliente e guarda a regra aplicada", async () => {
    const c = clientWithTerm(30);
    const r = await approvedWithInstallment(c.id, { dueRule: "Na aprovação", dueAt: null });
    const diff = (new Date(r.expectedAt).getTime() - Date.now()) / DAY;
    expect(Math.round(diff)).toBe(30);
    expect(r.dueBasis).toContain("30 dias");
  });

  it("sem prazo cadastrado mantém o padrão (+5 dias na aprovação)", async () => {
    const c = clientWithTerm(null);
    const r = await approvedWithInstallment(c.id, { dueRule: "Na aprovação", dueAt: null });
    expect(Math.round((new Date(r.expectedAt).getTime() - Date.now()) / DAY)).toBe(5);
    expect(r.dueBasis).toContain("sem prazo");
  });

  it("data informada na parcela prevalece", async () => {
    const c = clientWithTerm(30);
    const at = new Date(Date.now() + 10 * DAY).toISOString();
    const r = await approvedWithInstallment(c.id, { dueRule: null, dueAt: at });
    expect(r.expectedAt).toBe(at);
  });

  it("emitir NF grava o vencimento informado, com antes/depois no histórico", async () => {
    const c = clientWithTerm(20);
    const r = await approvedWithInstallment(c.id, { dueRule: "Na aprovação", dueAt: null });
    as("usr_fernanda");
    const due = new Date(Date.now() + 25 * DAY).toISOString();
    await financeApi.issueInvoice(r.id, { invoiceNumber: "123", issuedAt: new Date().toISOString(), expectedAt: due });
    const after = loadDb().receivables.find((x) => x.id === r.id)!;
    expect(after.expectedAt).toBe(due);
    expect(loadDb().events.some((e) => e.entityId === r.id && e.type === "receivable.value_changed" && e.data.field === "expectedAt")).toBe(true);
  });

  it("emitir NF sem vencimento aplica emissão + prazo do cliente", async () => {
    const c = clientWithTerm(20);
    const r = await approvedWithInstallment(c.id, { dueRule: "Na aprovação", dueAt: null });
    as("usr_fernanda");
    const issuedAt = new Date(Date.now() + 2 * DAY).toISOString();
    await financeApi.issueInvoice(r.id, { invoiceNumber: "124", issuedAt });
    const after = loadDb().receivables.find((x) => x.id === r.id)!;
    expect(Math.round((new Date(after.expectedAt).getTime() - new Date(issuedAt).getTime()) / DAY)).toBe(20);
    expect(after.dueBasis).toContain("Emissão da NF + 20 dias");
  });
});

describe("RN-45 — vencido derivado em todas as telas", () => {
  it("ficha do cliente e cartão do projeto mostram vencido", async () => {
    const db = loadDb();
    const r = db.receivables.find((x) => x.status === "previsto" && !x.deletedAt)!;
    r.expectedAt = new Date(Date.now() - 5 * DAY).toISOString();
    save(db);
    const { clientsApi } = await import("./index");
    const c = await clientsApi.get(r.clientId);
    expect(c.receivables.find((x) => x.id === r.id)?.status).toBe("vencido");
    const p = c.projects.find((x) => x.id === r.projectId);
    if (p) expect(p.billingStatus).toBe("vencido");
    expect(loadDb().receivables.find((x) => x.id === r.id)?.status).toBe("previsto");
  });
});

describe("RN-46 — alertas e avisos financeiros só para quem está envolvido", () => {
  const notesOf = (userId: string) => loadDb().notifications.filter((n) => n.userId === userId);

  it("rotina diária avisa vencido ao Financeiro e ao responsável, uma única vez", async () => {
    const { routinesApi } = await import("./index");
    const db = loadDb();
    const r = db.receivables.find((x) => x.status === "previsto" && !x.deletedAt)!;
    r.expectedAt = new Date(Date.now() - 3 * DAY).toISOString();
    save(db);
    const owner = loadDb().projects.find((p) => p.id === r.projectId)!.ownerId;
    await routinesApi.runDaily();
    const count = notesOf("usr_fernanda").filter((n) => n.entityId === r.id && n.type === "vencimento").length;
    expect(count).toBe(1);
    if (owner !== "usr_fernanda") expect(notesOf(owner).some((n) => n.entityId === r.id && n.type === "vencimento")).toBe(true);
    await routinesApi.runDaily();
    expect(notesOf("usr_fernanda").filter((n) => n.entityId === r.id && n.type === "vencimento").length).toBe(1);
  });

  it("NF pendente perto do vencimento gera lembrete ao freelancer (e-mail) e alerta ao Financeiro", async () => {
    const { routinesApi } = await import("./index");
    const db = loadDb();
    const pay = db.payables.find((p) => p.kind === "freelancer" && p.status === "aguardando_nf")!;
    pay.dueAt = new Date(Date.now() + 3 * DAY).toISOString();
    save(db);
    const mails = loadDb().emailLogs.length;
    await routinesApi.runDaily();
    const after = loadDb();
    expect(after.events.some((e) => e.entityId === pay.id && e.type === "payable.invoice_reminder_sent")).toBe(true);
    const fl = after.freelancers.find((f) => f.id === pay.freelancerId)!;
    if (fl.email) expect(after.emailLogs.length).toBeGreaterThan(mails);
    expect(notesOf("usr_fernanda").some((n) => n.entityId === pay.id)).toBe(true);
  });

  it("freelancer é avisado de divergência e de pagamento", async () => {
    const db = loadDb();
    const julia = db.freelancers.find((f) => f.userId === "usr_julia")!;
    const pay = db.payables.find((p) => p.freelancerId === julia.id && p.kind === "freelancer")!;
    pay.status = "em_conferencia";
    save(db);
    as("usr_fernanda");
    await financeApi.markDivergent(pay.id, "CNPJ errado na nota");
    expect(notesOf("usr_julia").some((n) => n.type === "pagamento" && n.entityId === pay.id)).toBe(true);
    await financeApi.approvePayable(pay.id);
    await financeApi.pay(pay.id, new Date().toISOString());
    expect(notesOf("usr_julia").filter((n) => n.type === "pagamento" && n.entityId === pay.id).length).toBe(3);
    expect(loadDb().emailLogs.some((m) => m.template === "pagamento_freelancer")).toBe(true);
  });

  it("NF recebida pelo formulário não vai para o admin quando há Financeiro", async () => {
    const { publicInvoiceApi } = await import("./index");
    const db = loadDb();
    const pay = db.payables.find((p) => p.status === "aguardando_nf" && p.kind === "freelancer")!;
    const req = db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id)!;
    const link = db.shareLinks.find((s) => s.id === req.shareLinkId)!;
    link.expiresAt = new Date(Date.now() + DAY).toISOString();
    link.useCount = 0;
    save(db);
    const adminBefore = notesOf("usr_paula").filter((n) => n.type === "nf_recebida").length;
    await publicInvoiceApi.submit(link.token, { legalName: "A", document: "123", pixKey: "x", invoiceNumber: "9", amountCents: pay.agreedAmountCents, fileName: "nf.pdf", fileSize: 10, dataUrl: null });
    expect(notesOf("usr_paula").filter((n) => n.type === "nf_recebida").length).toBe(adminBefore);
    expect(notesOf("usr_fernanda").some((n) => n.type === "nf_recebida" && n.entityId === pay.id)).toBe(true);
  });
});

describe("RN-47 — estornos com motivo, permissão e histórico", () => {
  async function receivedReceivable() {
    const db = loadDb();
    const r = db.receivables.find((x) => x.status === "previsto" && !x.deletedAt)!;
    save(db);
    as("usr_fernanda");
    await financeApi.issueInvoice(r.id, { invoiceNumber: "77", issuedAt: new Date().toISOString() });
    await financeApi.receive(r.id, new Date().toISOString());
    return r.id;
  }

  it("estornar baixa volta a faturado e cancelar NF volta a previsto", async () => {
    const { reversalsApi } = await import("./index");
    const id = await receivedReceivable();
    await expect(reversalsApi.cancelInvoice(id, "erro")).rejects.toMatchObject({ status: 409 });
    await expect(reversalsApi.undoReceipt(id, "  ")).rejects.toMatchObject({ status: 422 });
    await reversalsApi.undoReceipt(id, "baixa no lançamento errado");
    let r = loadDb().receivables.find((x) => x.id === id)!;
    expect(r.status).toBe("faturado");
    expect(r.receivedAt).toBeNull();
    await reversalsApi.cancelInvoice(id, "CNPJ errado");
    r = loadDb().receivables.find((x) => x.id === id)!;
    expect(r.status).toBe("previsto");
    expect(r.invoiceNumber).toBeNull();
    const evs = loadDb().events.filter((e) => e.entityId === id).map((e) => e.type);
    expect(evs).toEqual(expect.arrayContaining(["receivable.receipt_reversed", "receivable.invoice_cancelled"]));
  });

  it("Comercial não estorna", async () => {
    const { reversalsApi } = await import("./index");
    const id = await receivedReceivable();
    as("usr_carlos");
    await expect(reversalsApi.undoReceipt(id, "x")).rejects.toMatchObject({ status: 403 });
  });

  it("desfazer aprovação e estornar pagamento (freelancer avisado)", async () => {
    const { reversalsApi } = await import("./index");
    const db = loadDb();
    const julia = db.freelancers.find((f) => f.userId === "usr_julia")!;
    const pay = db.payables.find((p) => p.freelancerId === julia.id && p.kind === "freelancer")!;
    pay.status = "em_conferencia";
    pay.invoicedAmountCents = pay.agreedAmountCents;
    save(db);
    as("usr_fernanda");
    await financeApi.approvePayable(pay.id);
    await reversalsApi.undoPayableApproval(pay.id, "conferir banco");
    expect(loadDb().payables.find((p) => p.id === pay.id)!.status).toBe("em_conferencia");
    await financeApi.approvePayable(pay.id);
    await financeApi.pay(pay.id, new Date().toISOString());
    await reversalsApi.reversePayment(pay.id, "PIX devolvido");
    const after = loadDb().payables.find((p) => p.id === pay.id)!;
    expect(after.status).toBe("aprovado");
    expect(after.paidAt).toBeNull();
    expect(loadDb().notifications.some((n) => n.userId === "usr_julia" && n.title === "Pagamento estornado")).toBe(true);
  });
});

describe("RN-65 — margem com adicionais e impostos", () => {
  it("adicional soma à receita e impostos saem da margem", async () => {
    as("usr_fernanda");
    const db = loadDb();
    const p = db.projects.find((x) => x.status === "ativo" && x.contractedAmountCents && !x.deletedAt)!;
    const before = await projectsApi.financials(p.id);
    await financeApi.addAdditionalCharge(p.id, { description: "Extra", amountCents: 100_000, expectedAt: new Date().toISOString() });
    const after = await projectsApi.financials(p.id);
    expect(after.additionalCents - before.additionalCents).toBe(100_000);
    expect(after.revenueCents).toBe(after.contractedCents + after.additionalCents);
    expect(after.marginCents - before.marginCents).toBe(100_000 - 6_000);
    expect(after.marginCents).toBe(after.revenueCents - after.taxCents - after.freelancerCostCents - after.otherCostCents);
  });
});

describe("RN-48 — dados do freelancer no link público e no pagamento", () => {
  function linkFor() {
    const db = loadDb();
    const pay = db.payables.find((p) => p.status === "aguardando_nf" && p.kind === "freelancer")!;
    const fl = db.freelancers.find((f) => f.id === pay.freelancerId)!;
    fl.document = "12345678901";
    fl.pixKey = "pix-antigo@x.com";
    fl.bankAccount = "99999-9";
    const req = db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id)!;
    const link = db.shareLinks.find((s) => s.id === req.shareLinkId)!;
    link.expiresAt = new Date(Date.now() + DAY).toISOString();
    link.useCount = 0;
    save(db);
    return { pay, fl, token: link.token };
  }

  it("o link não devolve CPF, PIX completos nem conta bancária", async () => {
    const { publicInvoiceApi } = await import("./index");
    const { token } = linkFor();
    const info = await publicInvoiceApi.get(token);
    const json = JSON.stringify(info);
    expect(json).not.toContain("12345678901");
    expect(json).not.toContain("pix-antigo@x.com");
    expect(json).not.toContain("99999-9");
    expect(info.freelancer.documentMasked).toBe("•••• 8901");
  });

  it("documento/PIX em branco mantêm o cadastro; declarado diferente pode atualizar o cadastro", async () => {
    const { publicInvoiceApi, freelancerPaymentDataApi } = await import("./index");
    const { pay, fl, token } = linkFor();
    await publicInvoiceApi.submit(token, { legalName: "Nova Razão ME", document: "", pixKey: "pix-novo@x.com", invoiceNumber: "5", amountCents: pay.agreedAmountCents, fileName: "nf.pdf", fileSize: 10, dataUrl: null });
    const req = loadDb().freelancerInvoiceRequests.find((r) => r.payableId === pay.id)!;
    expect(req.declaredDocument).toBe("12345678901");
    as("usr_fernanda");
    const data = await freelancerPaymentDataApi.get(pay.id);
    expect(data.differs.map((d) => d.field)).toEqual(expect.arrayContaining(["pixKey", "legalName"]));
    await freelancerPaymentDataApi.applyDeclared(pay.id);
    const after = loadDb().freelancers.find((f) => f.id === fl.id)!;
    expect(after.pixKey).toBe("pix-novo@x.com");
    expect(after.legalName).toBe("Nova Razão ME");
    const ev = loadDb().events.find((e) => e.type === "freelancer.payment_data_updated" && e.entityId === fl.id)!;
    expect(JSON.stringify(ev.data)).not.toContain("pix-novo@x.com");
    as("usr_carlos");
    await expect(freelancerPaymentDataApi.get(pay.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-49 — cobrança do cliente pelo Financeiro e remoção do contato de cobrança", () => {
  it("Financeiro edita prazo/política e o contato de cobrança, mas não outros contatos nem o cadastro", async () => {
    const { clientBillingApi, clientsApi } = await import("./index");
    const c = loadDb().clients.find((x) => !x.deletedAt)!;
    as("usr_fernanda");
    await clientBillingApi.updateTerms(c.id, { paymentTermsNote: "28 dias após a NF", paymentTermDays: 28 });
    expect(loadDb().clients.find((x) => x.id === c.id)!.paymentTermDays).toBe(28);
    await expect(clientBillingApi.updateTerms(c.id, { paymentTermsNote: null, paymentTermDays: 900 })).rejects.toMatchObject({ status: 422 });
    const created = await clientsApi.saveContact(c.id, { name: "Contas a pagar", email: "ap@cliente.com.br", phone: null, jobTitle: null, isBillingContact: true, isDecisionMaker: false });
    expect(created.isBillingContact).toBe(true);
    await expect(clientsApi.saveContact(c.id, { name: "Diretor", email: "d@cliente.com.br", phone: null, jobTitle: null, isBillingContact: false, isDecisionMaker: true })).rejects.toMatchObject({ status: 403 });
    as("usr_lucas");
    await expect(clientBillingApi.updateTerms(c.id, { paymentTermsNote: null, paymentTermDays: 10 })).rejects.toMatchObject({ status: 403 });
  });

  it("novo contato de cobrança passa para os projetos em aberto; removê-lo exige quem assume", async () => {
    const { clientsApi } = await import("./index");
    const db = loadDb();
    const p = db.projects.find((x) => x.status === "ativo" && !x.deletedAt)!;
    const c = db.clients.find((x) => x.id === p.clientId)!;
    const other = { ...db.clientContacts.find((k) => k.clientId === c.id)!, id: "cc_outro", isBillingContact: false, deletedAt: null, email: "outro@c.com" };
    db.clientContacts.push(other);
    save(db);
    const billing = await clientsApi.saveContact(c.id, { name: "Cobrança", email: "cob@c.com", phone: null, jobTitle: null, isBillingContact: true, isDecisionMaker: false });
    expect(loadDb().projects.find((x) => x.id === p.id)!.billingContactId).toBe(billing.id);
    await expect(clientsApi.removeContact(billing.id)).rejects.toMatchObject({ status: 422 });
    const r = await clientsApi.removeContact(billing.id, "cc_outro");
    expect(r.projectsUpdated).toBeGreaterThan(0);
    const after = loadDb();
    expect(after.projects.find((x) => x.id === p.id)!.billingContactId).toBe("cc_outro");
    expect(after.clientContacts.find((x) => x.id === "cc_outro")!.isBillingContact).toBe(true);
  });
});

describe("Freelancer — e-mail único e sincronizado com o login", () => {
  const input = (f: ReturnType<typeof loadDb>["freelancers"][number], email: string) => ({ name: f.name, email, phone: f.phone, legalName: f.legalName, document: f.document, pixKey: f.pixKey, bankName: f.bankName, bankAgency: f.bankAgency, bankAccount: f.bankAccount, jobTitle: f.jobTitle ?? "Designer", specialties: f.specialties, status: f.status, notes: f.notes });

  it("recusa e-mail de outro freelancer ou usuário e sincroniza o login", async () => {
    const { freelancersApi } = await import("./index");
    as("usr_fernanda");
    const db = loadDb();
    const julia = db.freelancers.find((f) => f.userId === "usr_julia")!;
    const other = db.freelancers.find((f) => f.id !== julia.id && !f.deletedAt)!;
    await expect(freelancersApi.update(julia.id, input(julia, other.email.toUpperCase()))).rejects.toMatchObject({ status: 409 });
    await expect(freelancersApi.update(julia.id, input(julia, "paula@draw.com.br"))).rejects.toMatchObject({ status: 409 });
    await freelancersApi.update(julia.id, input(julia, "Julia.Nova@Gmail.com"));
    const after = loadDb();
    expect(after.freelancers.find((f) => f.id === julia.id)!.email).toBe("julia.nova@gmail.com");
    expect(after.users.find((u) => u.id === "usr_julia")!.email).toBe("julia.nova@gmail.com");
  });
});

describe("RN-66 — indicadores com período e escopo do perfil", () => {
  it("Comercial recebe só os comerciais; Financeiro só os financeiros", async () => {
    const { metricsApi } = await import("./index");
    as("usr_carlos");
    const c = await metricsApi.indicators({});
    expect(c.commercial).not.toBeNull();
    expect(c.finance).toBeNull();
    expect(c.operation).toBeNull();
    as("usr_fernanda");
    const f = await metricsApi.indicators({});
    expect(f.finance).not.toBeNull();
    expect(f.commercial).toBeNull();
    as("usr_paula");
    const a = await metricsApi.indicators({});
    expect(a.commercial && a.operation && a.finance).toBeTruthy();
  });

  it("financeiro respeita o período (projetos aprovados no período e meses do período)", async () => {
    const { metricsApi } = await import("./index");
    const now = Date.now();
    const all = await metricsApi.indicators({ from: new Date(now - 3650 * DAY).toISOString(), to: new Date(now).toISOString() });
    const short = await metricsApi.indicators({ from: new Date(now - 30 * DAY).toISOString(), to: new Date(now).toISOString() });
    expect(short.finance!.contractedTotal).toBeLessThanOrEqual(all.finance!.contractedTotal);
    expect(short.finance!.revenueByMonth.length).toBeLessThanOrEqual(2);
    const inShort = loadDb().projects.filter((p) => !p.deletedAt && p.contractedAmountCents && p.approvedAt && new Date(p.approvedAt).getTime() >= now - 30 * DAY).reduce((a, p) => a + (p.contractedAmountCents ?? 0), 0);
    expect(short.finance!.contractedTotal).toBe(inShort);
  });
});

describe("RN-67 — cobrança pronta para copiar e contato do Financeiro", () => {
  it("monta a mensagem para o contato de cobrança e registra o envio", async () => {
    const { collectionApi, usersApi } = await import("./index");
    as("usr_paula");
    const org = loadDb().organizations[0].settings;
    await usersApi.updateOrganization({ freelancerPaymentDay: org.freelancerPaymentDay, dueSoonDays: org.dueSoonDays, taxRatePct: org.taxRatePct, financeContactEmail: "financeiro@draw.com.br", financeContactPhone: "(11) 4000-0000" });
    await expect(usersApi.updateOrganization({ freelancerPaymentDay: 20, dueSoonDays: 2, financeContactEmail: "sem-arroba" })).rejects.toMatchObject({ status: 422 });
    const db = loadDb();
    const r = db.receivables.find((x) => x.status === "previsto" && !x.deletedAt && db.projects.find((p) => p.id === x.projectId)?.billingContactId)!;
    r.expectedAt = new Date(Date.now() - 5 * DAY).toISOString();
    save(db);
    as("usr_fernanda");
    const m = await collectionApi.message(r.id);
    expect(m.overdue).toBe(true);
    expect(m.to?.email).toBeTruthy();
    expect(m.body).toContain("financeiro@draw.com.br");
    await collectionApi.registerSent(r.id, { channel: "whatsapp", note: "prometeu pagar" });
    const after = loadDb().receivables.find((x) => x.id === r.id)!;
    expect(after.collectionNote).toContain("WhatsApp");
    expect(loadDb().events.some((e) => e.entityId === r.id && e.type === "receivable.collection_sent")).toBe(true);
    as("usr_carlos");
    await expect(collectionApi.registerSent(r.id, { channel: "email" })).rejects.toMatchObject({ status: 403 });
  });

  it("página pública de NF traz o contato do Financeiro", async () => {
    const { publicInvoiceApi } = await import("./index");
    const db = loadDb();
    db.organizations[0].settings.financeContactEmail = "fin@draw.com.br";
    const pay = db.payables.find((p) => p.status === "aguardando_nf" && p.kind === "freelancer")!;
    const req = db.freelancerInvoiceRequests.find((x) => x.payableId === pay.id)!;
    const link = db.shareLinks.find((s) => s.id === req.shareLinkId)!;
    link.expiresAt = new Date(Date.now() + DAY).toISOString();
    save(db);
    const info = await publicInvoiceApi.get(link.token);
    expect(info.financeContact.email).toBe("fin@draw.com.br");
  });
});
