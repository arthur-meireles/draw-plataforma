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
