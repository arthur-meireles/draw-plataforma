/**
 * Financeiro, cadastros e painel — furos médios da onda 3 (RN-85 a RN-94): recebível avulso e edição com imposto,
 * cancelar/reativar com motivo, pagáveis canceláveis, despesas com favorecido, validações do formulário público,
 * cadastros (cliente inativo, grupos, contatos, freelancers) e painel.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { clientGroupsApi, clientsApi, financeApi, financeMedioApi, freelancerLifecycleApi, freelancersApi, payablesExtraApi, projectLifecycleApi, projectsApi, proposalsApi, publicInvoiceApi } from "./index";

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

/* ───────── RN-86 / RN-87 — pagáveis e despesas ───────── */

async function projectWithFreelancerPayable() {
  const db = loadDb();
  const fl = db.freelancers.find((f) => f.status === "ativo" && f.email)!;
  const p = await projectsApi.createDirect({
    clientId: db.clients[0].id,
    projectTypeId: typeByPrefix("INF").id,
    title: "Infográfico",
    ownerId: "usr_beatriz",
    contractedAmountCents: 1_000_000,
    installments: [{ description: "Única", amountCents: 1_000_000, expectedAt: new Date().toISOString() }],
    team: [{ freelancerId: fl.id, memberRole: "designer", agreedAmountCents: 200_000 }],
    dueAt: null,
  });
  const m = loadDb().projectMembers.find((x) => x.projectId === p.id && x.freelancerId)!;
  as("usr_fernanda");
  const pay = await payablesExtraApi.createFreelancerPayment({ projectId: p.id, memberId: m.id, amountCents: 200_000 });
  return { p, fl, m, pay: loadDb().payables.find((x) => x.id === pay.id)! };
}

describe("RN-86 — editar, cancelar e reativar contas a pagar", () => {
  it("edita vencimento e descrição do freelancer com antes/depois; valor só de despesa", async () => {
    const { pay } = await projectWithFreelancerPayable();
    const due = new Date(Date.now() + 40 * 86_400_000).toISOString();
    await financeMedioApi.updatePayable(pay.id, { dueAt: due, description: "Roteiro — exceção" });
    const after = loadDb().payables.find((x) => x.id === pay.id)!;
    expect(after.dueAt).toBe(due);
    expect(loadDb().events.some((e) => e.entityId === pay.id && e.type === "payable.value_changed" && e.data.field === "dueAt")).toBe(true);
    await expect(financeMedioApi.updatePayable(pay.id, { agreedAmountCents: 1 })).rejects.toMatchObject({ status: 422 });
    as("usr_carlos");
    await expect(financeMedioApi.updatePayable(pay.id, { description: "x" })).rejects.toMatchObject({ status: 403 });
  });

  it("despesa nasce com favorecido e categoria e aceita edição de valor", async () => {
    as("usr_fernanda");
    const e = await financeApi.createExpense({ kind: "despesa_adm", description: "Software", agreedAmountCents: 50_000, dueAt: new Date().toISOString(), payeeName: " Figma ", category: "Ferramentas" });
    expect(e.payeeName).toBe("Figma");
    expect(e.category).toBe("Ferramentas");
    await financeMedioApi.updatePayable(e.id, { agreedAmountCents: 60_000, payeeName: "Figma Inc." });
    const saved = loadDb().payables.find((x) => x.id === e.id)!;
    expect(saved.agreedAmountCents).toBe(60_000);
    expect(saved.payeeName).toBe("Figma Inc.");
  });

  it("cancelar exige motivo, sai do custo do projeto, revoga o link e pode ser reativado", async () => {
    const { p, pay } = await projectWithFreelancerPayable();
    const costBefore = (await projectsApi.financials(p.id)).freelancerCostCents;
    expect(costBefore).toBe(200_000);
    const toPayBefore = (await financeApi.overview()).totals.toPay;
    await expect(financeMedioApi.cancelPayable(pay.id, "")).rejects.toMatchObject({ status: 422 });
    await financeMedioApi.cancelPayable(pay.id, "Lançada em duplicidade");
    const db = loadDb();
    expect(db.payables.find((x) => x.id === pay.id)!.status).toBe("cancelado");
    const req = db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id)!;
    expect(db.shareLinks.find((s) => s.id === req.shareLinkId)!.revokedAt).toBeTruthy();
    await expect(financeApi.resendInvoiceLink(pay.id)).rejects.toMatchObject({ status: 409 });
    await expect(financeApi.pay(pay.id, new Date().toISOString())).rejects.toMatchObject({ status: 409 });
    await expect(financeMedioApi.cancelPayable(pay.id, "de novo")).rejects.toMatchObject({ status: 409 });
    expect((await financeApi.overview()).totals.toPay).toBe(toPayBefore - 200_000);
    await financeMedioApi.reactivatePayable(pay.id, "Foi engano");
    const back = loadDb().payables.find((x) => x.id === pay.id)!;
    expect(back.status).toBe("aguardando_nf");
    expect(loadDb().shareLinks.find((s) => s.id === req.shareLinkId)!.revokedAt).toBeNull();
  });

  it("conta paga não cancela nem edita", async () => {
    as("usr_fernanda");
    const e = await financeApi.createExpense({ kind: "despesa_adm", description: "Domínio", agreedAmountCents: 10_000, dueAt: new Date().toISOString() });
    await financeApi.pay(e.id, new Date().toISOString());
    await expect(financeMedioApi.cancelPayable(e.id, "x")).rejects.toMatchObject({ status: 409 });
    await expect(financeMedioApi.updatePayable(e.id, { description: "x" })).rejects.toMatchObject({ status: 409 });
  });

  it("cancelar o projeto cancela as contas de freelancer que aguardam NF e reativar devolve", async () => {
    const { p, pay } = await projectWithFreelancerPayable();
    as("usr_beatriz");
    await projectsApi.cancel(p.id, "Cliente desistiu");
    expect(loadDb().payables.find((x) => x.id === pay.id)!.status).toBe("cancelado");
    expect(loadDb().payables.find((x) => x.id === pay.id)!.cancelReason).toContain("Cliente desistiu");
    await projectLifecycleApi.reactivateCancelled(p.id, "Voltou");
    expect(loadDb().payables.find((x) => x.id === pay.id)!.status).toBe("aguardando_nf");
  });
});

describe("RN-89 — formulário público e cadastros validam documento no serviço", () => {
  it("NF pública recusa CPF/CNPJ sem 11 ou 14 dígitos", async () => {
    const { pay } = await projectWithFreelancerPayable();
    const db = loadDb();
    const req = db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id)!;
    const token = db.shareLinks.find((s) => s.id === req.shareLinkId)!.token;
    const base = { legalName: "Ana ME", pixKey: "ana@x.com", invoiceNumber: "7", amountCents: pay.agreedAmountCents, fileName: "nf.pdf", fileSize: 10, dataUrl: null };
    await expect(publicInvoiceApi.submit(token, { ...base, document: "123" })).rejects.toMatchObject({ status: 422, fieldErrors: { document: expect.any(String) } });
    const ok = await publicInvoiceApi.submit(token, { ...base, document: "123.456.789-09" });
    expect(ok.status).toBe("em_conferencia");
  });

  it("cadastro de freelancer valida CPF/CNPJ e PIX e registra mudança de dado bancário", async () => {
    as("usr_fernanda");
    const fl = loadDb().freelancers.find((f) => f.status === "ativo")!;
    const input = { name: fl.name, email: fl.email, phone: fl.phone, legalName: fl.legalName, document: "123", pixKey: fl.pixKey, bankName: null, bankAgency: null, bankAccount: null, jobTitle: fl.jobTitle ?? "Designer", specialties: fl.specialties, status: fl.status, notes: null };
    await expect(freelancersApi.update(fl.id, input)).rejects.toMatchObject({ status: 422, fieldErrors: { document: expect.any(String) } });
    await expect(freelancersApi.update(fl.id, { ...input, document: "12345678000190", pixKey: "???" })).rejects.toMatchObject({ status: 422, fieldErrors: { pixKey: expect.any(String) } });
    await freelancersApi.update(fl.id, { ...input, document: "12345678000190", pixKey: "nova@pix.com" });
    expect(loadDb().events.some((e) => e.entityId === fl.id && e.type === "freelancer.bank_data_changed" && (e.data.fields as string[]).includes("pixKey"))).toBe(true);
  });
});

/* ───────── RN-88 — cadastros ───────── */

describe("RN-88 — cliente inativo, grupos e exclusões", () => {
  it("cliente inativo não recebe cotação nem projeto direto; reativado, volta", async () => {
    const db = loadDb();
    const c = db.clients.find((x) => !x.deletedAt)!;
    c.status = "inativo";
    save(db);
    await expect(projectsApi.createQuote({ clientId: c.id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: "usr_carlos" })).rejects.toMatchObject({ status: 409 });
    as("usr_beatriz");
    await expect(
      projectsApi.createDirect({ clientId: c.id, projectTypeId: typeByPrefix("INF").id, title: "X", ownerId: "usr_beatriz", contractedAmountCents: 100, installments: [{ description: "U", amountCents: 100, expectedAt: new Date().toISOString() }], team: [], dueAt: null }),
    ).rejects.toMatchObject({ status: 409 });
    const db2 = loadDb();
    db2.clients.find((x) => x.id === c.id)!.status = "ativo";
    save(db2);
    as("usr_carlos");
    await expect(projectsApi.createQuote({ clientId: c.id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: "usr_carlos" })).resolves.toBeTruthy();
  });

  it("grupo: nome único, renomear e excluir só vazio (Comercial/Gestão/Admin)", async () => {
    as("usr_carlos");
    const g = await clientsApi.createGroup("Grupo Teste");
    await expect(clientsApi.createGroup(" grupo teste ")).rejects.toMatchObject({ status: 409 });
    await clientGroupsApi.rename(g.id, "Grupo Novo");
    await expect(clientGroupsApi.rename(g.id, " ")).rejects.toMatchObject({ status: 422 });
    expect(loadDb().events.some((e) => e.type === "client_group.renamed" && e.entityId === g.id)).toBe(true);
    as("usr_fernanda");
    await expect(clientGroupsApi.rename(g.id, "Outro")).rejects.toMatchObject({ status: 403 });
    await expect(clientGroupsApi.remove(g.id)).rejects.toMatchObject({ status: 403 });
    as("usr_carlos");
    const db = loadDb();
    db.clients.find((c) => !c.deletedAt)!.groupId = g.id;
    save(db);
    await expect(clientGroupsApi.remove(g.id)).rejects.toMatchObject({ status: 409 });
    const db2 = loadDb();
    db2.clients.forEach((c) => c.groupId === g.id && (c.groupId = null));
    save(db2);
    await clientGroupsApi.remove(g.id);
    expect((await clientsApi.groups()).some((x) => x.id === g.id)).toBe(false);
  });

  it("excluir cliente sem projetos remove também os contatos", async () => {
    as("usr_carlos");
    const input = { groupId: null, legalName: "Nova Cliente Ltda", tradeName: "Nova", cnpj: "11.222.333/0001-81", segment: "Teste", status: "ativo" as const, address: { street: "R", number: "1", complement: null, district: "B", city: "SP", state: "SP", zip: "01000-000" } };
    const c = await clientsApi.create(input as never);
    await clientsApi.saveContact(c.id, { name: "Ana", email: "ana@nova.com", phone: null, role: null, isBillingContact: true, isDecisionMaker: false } as never);
    await clientsApi.remove(c.id);
    expect(loadDb().clientContacts.filter((k) => k.clientId === c.id && !k.deletedAt)).toHaveLength(0);
  });

  it("freelancer: prévia de inativação e exclusão só sem histórico", async () => {
    as("usr_fernanda");
    const db = loadDb();
    const withHistory = db.freelancers.find((f) => db.projectMembers.some((m) => m.freelancerId === f.id && m.active))!;
    const impact = await freelancerLifecycleApi.inactivationImpact(withHistory.id);
    expect(impact.activeProjects.length + impact.openTasks + impact.openPayables).toBeGreaterThan(0);
    await expect(freelancerLifecycleApi.remove(withHistory.id)).rejects.toMatchObject({ status: 409 });
    const fresh = await freelancersApi.create({ name: "Zé Novo", email: "ze.novo@gmail.com", phone: null, legalName: null, document: null, pixKey: null, bankName: null, bankAgency: null, bankAccount: null, jobTitle: "Designer", specialties: ["design"], status: "ativo", notes: null });
    const f2 = await freelancersApi.create({ name: "Zé Dois", email: "ze.dois@gmail.com", phone: null, legalName: null, document: null, pixKey: null, bankName: null, bankAgency: null, bankAccount: null, jobTitle: "Designer", specialties: ["design"], status: "ativo", notes: null });
    await freelancerLifecycleApi.remove(f2.id);
    expect(loadDb().freelancers.find((f) => f.id === f2.id)!.deletedAt).toBeTruthy();
    as("usr_carlos");
    await expect(freelancerLifecycleApi.remove(fresh.id)).rejects.toMatchObject({ status: 403 });
  });

  it("proposta nova herda a política de pagamento do cliente quando vem em branco", async () => {
    const db = loadDb();
    const c = db.clients.find((x) => !x.deletedAt && x.status === "ativo")!;
    c.paymentTermsNote = "50% na aprovação, 50% na entrega";
    save(db);
    as("usr_carlos");
    const q = await projectsApi.createQuote({ clientId: c.id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: "usr_carlos" });
    const prop = await proposalsApi.create(q.id, { amountCents: 100_000, installments: [{ amountCents: 100_000, dueRule: "Na aprovação", dueAt: null }] });
    expect(prop.paymentTermsNote).toBe("50% na aprovação, 50% na entrega");
  });

  it("contratado do cliente soma só projetos ativos, concluídos e arquivados", async () => {
    as("usr_paula");
    const list = await clientsApi.list();
    const db = loadDb();
    for (const c of list) {
      const expected = db.projects.filter((p) => p.clientId === c.id && !p.deletedAt && ["ativo", "concluido", "arquivado"].includes(p.status)).reduce((a, p) => a + (p.contractedAmountCents ?? 0), 0);
      expect(c.contractedCents).toBe(expected);
    }
  });
});
