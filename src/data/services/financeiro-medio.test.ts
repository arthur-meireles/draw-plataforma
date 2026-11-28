/**
 * Financeiro, cadastros e painel — furos médios da onda 3 (RN-85 a RN-94): recebível avulso e edição com imposto,
 * cancelar/reativar com motivo, pagáveis canceláveis, despesas com favorecido, validações do formulário público,
 * cadastros (cliente inativo, grupos, contatos, freelancers) e painel.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { financeApi, financeMedioApi, projectsApi } from "./index";

const as = (userId: string) => setSessionUserId(userId);
const typeByPrefix = (p: string) => loadDb().projectTypes.find((t) => t.codePrefix === p)!;
const save = (db: ReturnType<typeof loadDb>) => window.localStorage.setItem("draw:db", JSON.stringify(db));

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as("usr_paula");
});

async function directProject(over: { contracted?: number; installments?: number[] } = {}) {
  const db = loadDb();
  const inst = over.installments ?? [500_000, 500_000];
  return projectsApi.createDirect({
    clientId: db.clients[0].id,
    projectTypeId: typeByPrefix("INF").id,
    title: "Infográfico",
    ownerId: "usr_beatriz",
    contractedAmountCents: over.contracted ?? inst.reduce((a, b) => a + b, 0),
    installments: inst.map((amountCents, i) => ({ description: `Parcela ${i + 1}`, amountCents, expectedAt: new Date(Date.now() + (i + 1) * 86_400_000).toISOString() })),
    team: [],
    dueAt: null,
  });
}
const recsOf = (projectId: string) => loadDb().receivables.filter((r) => r.projectId === projectId);

describe("RN-90 — projeto direto avisa o Financeiro e parcelas × contratado", () => {
  it("projeto direto notifica o Financeiro", async () => {
    const p = await directProject();
    const n = loadDb().notifications.filter((x) => x.projectId === p.id && x.userId === "usr_fernanda" && x.type === "aprovacao");
    expect(n).toHaveLength(1);
  });

  it("financials expõe a diferença entre parcelas e contratado", async () => {
    const p = await directProject({ installments: [500_000, 500_000] });
    await projectsApi.update(p.id, { contractedAmountCents: 1_200_000 });
    const f = await projectsApi.financials(p.id);
    expect(f.parcelsCents).toBe(1_000_000);
    expect(f.parcelsGapCents).toBe(-200_000);
    const ok = await directProject();
    expect((await projectsApi.financials(ok.id)).parcelsGapCents).toBe(0);
  });
});

describe("RN-85 — recebíveis: avulso, edição, cancelamento e reativação", () => {
  it("Financeiro cria recebível avulso com imposto; outros perfis não", async () => {
    const p = await directProject();
    as("usr_fernanda");
    const r = await financeMedioApi.createReceivable({ projectId: p.id, description: "Extra combinado", amountCents: 100_000, expectedAt: new Date().toISOString() });
    expect(r.status).toBe("previsto");
    expect(r.taxCents).toBe(6_000);
    as("usr_carlos");
    await expect(financeMedioApi.createReceivable({ projectId: p.id, description: "x", amountCents: 1, expectedAt: new Date().toISOString() })).rejects.toMatchObject({ status: 403 });
    as("usr_fernanda");
    await expect(financeMedioApi.createReceivable({ projectId: p.id, description: "", amountCents: 0, expectedAt: "" })).rejects.toMatchObject({ status: 422 });
  });

  it("não cria em cotação", async () => {
    const db = loadDb();
    const q = await projectsApi.createQuote({ clientId: db.clients[0].id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: "usr_carlos" });
    await expect(financeMedioApi.createReceivable({ projectId: q.id, description: "x", amountCents: 100, expectedAt: new Date().toISOString() })).rejects.toMatchObject({ status: 409 });
  });

  it("editar valor recalcula o imposto; depois da NF o valor trava", async () => {
    const p = await directProject();
    const r = recsOf(p.id)[0];
    as("usr_fernanda");
    await financeApi.updateReceivable(r.id, { amountCents: 400_000 });
    expect(loadDb().receivables.find((x) => x.id === r.id)!.taxCents).toBe(24_000);
    await financeApi.issueInvoice(r.id, { invoiceNumber: "1", issuedAt: new Date().toISOString() });
    await expect(financeApi.updateReceivable(r.id, { amountCents: 300_000 })).rejects.toMatchObject({ status: 409 });
    await financeApi.updateReceivable(r.id, { description: "Nova descrição" });
    await financeApi.receive(r.id, new Date().toISOString());
    await expect(financeApi.updateReceivable(r.id, { description: "x" })).rejects.toMatchObject({ status: 409 });
  });

  it("baixa não aceita data anterior à emissão nem futura", async () => {
    const p = await directProject();
    const r = recsOf(p.id)[0];
    as("usr_fernanda");
    await financeApi.issueInvoice(r.id, { invoiceNumber: "2", issuedAt: new Date().toISOString() });
    await expect(financeApi.receive(r.id, new Date(Date.now() - 10 * 86_400_000).toISOString())).rejects.toMatchObject({ status: 422 });
    await expect(financeApi.receive(r.id, new Date(Date.now() + 10 * 86_400_000).toISOString())).rejects.toMatchObject({ status: 422 });
  });

  it("cancelar exige motivo, recusa recebido e pode ser reativado", async () => {
    const p = await directProject();
    const [a, b] = recsOf(p.id);
    as("usr_fernanda");
    await expect(financeApi.cancelReceivable(a.id, " ")).rejects.toMatchObject({ status: 422 });
    await financeApi.cancelReceivable(a.id, "Duplicado");
    const cancelled = loadDb().receivables.find((x) => x.id === a.id)!;
    expect(cancelled.status).toBe("cancelado");
    expect(cancelled.cancelReason).toBe("Duplicado");
    await expect(financeMedioApi.reactivateReceivable(a.id, "")).rejects.toMatchObject({ status: 422 });
    await financeMedioApi.reactivateReceivable(a.id, "Cancelado por engano");
    expect(loadDb().receivables.find((x) => x.id === a.id)!.status).toBe("previsto");
    await expect(financeMedioApi.reactivateReceivable(a.id, "de novo")).rejects.toMatchObject({ status: 409 });
    await financeApi.issueInvoice(b.id, { invoiceNumber: "3", issuedAt: new Date().toISOString() });
    await financeApi.receive(b.id, new Date().toISOString());
    await expect(financeApi.cancelReceivable(b.id, "x")).rejects.toMatchObject({ status: 409 });
  });

  it("cobrança adicional só em projeto ativo ou concluído", async () => {
    const db = loadDb();
    const q = await projectsApi.createQuote({ clientId: db.clients[0].id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: "usr_carlos" });
    as("usr_fernanda");
    await expect(financeApi.addAdditionalCharge(q.id, { description: "x", amountCents: 100, expectedAt: new Date().toISOString() })).rejects.toMatchObject({ status: 409 });
  });
});
