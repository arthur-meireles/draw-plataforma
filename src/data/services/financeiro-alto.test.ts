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
