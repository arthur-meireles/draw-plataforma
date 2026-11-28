/**
 * Comercial/Projetos/Tarefas — furos médios e baixos da onda 3 (RN-95..RN-101).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb, transaction } from "../db";
import { setSessionUserId } from "./_core";
import { approvalsApi, commercialApi, projectsApi, proposalsApi, tasksApi } from "./index";

const as = (userId: string) => setSessionUserId(userId);
const typeByPrefix = (p: string) => loadDb().projectTypes.find((t) => t.codePrefix === p)!;
const clientWithContact = () => {
  const db = loadDb();
  return db.clients.find((c) => db.clientContacts.some((k) => k.clientId === c.id && k.email))!;
};
const fresh = (id: string) => loadDb().projects.find((x) => x.id === id)!;
const notesFor = (userId: string, titlePart: string) => loadDb().notifications.filter((n) => n.userId === userId && n.title.includes(titlePart));

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as("usr_paula");
});

const quoteInput = (over: Partial<Parameters<typeof projectsApi.createQuote>[0]> = {}) => ({ clientId: clientWithContact().id, projectTypeId: typeByPrefix("APR").id, title: "Deck institucional", ownerId: "usr_carlos", ...over });

async function direct(extra: Partial<Parameters<typeof projectsApi.createDirect>[0]> = {}) {
  return projectsApi.createDirect({
    ...quoteInput({ title: "Contrato visual" }),
    contractedAmountCents: 100_000,
    installments: [{ description: "Única", amountCents: 100_000, expectedAt: new Date().toISOString() }],
    team: [{ userId: "usr_lucas", memberRole: "designer" }],
    dueAt: null,
    ...extra,
  });
}

async function sentQuote(installments = [{ amountCents: 900_000, dueRule: "Na aprovação", dueAt: null as string | null }], amount = 900_000) {
  const p = await projectsApi.createQuote(quoteInput());
  const prop = await proposalsApi.create(p.id, { amountCents: amount, installments });
  await proposalsApi.send(prop.id);
  return { p, prop };
}

describe("RN-95 — o serviço valida a criação (não só o assistente)", () => {
  it("cotação: título curto, tipo/cliente inexistentes e responsável freelancer/inativo dão 422 com fieldErrors", async () => {
    await expect(projectsApi.createQuote(quoteInput({ title: "ab" }))).rejects.toMatchObject({ status: 422, fieldErrors: { title: expect.any(String) } });
    await expect(projectsApi.createQuote(quoteInput({ ownerId: "usr_julia" }))).rejects.toMatchObject({ status: 422, fieldErrors: { ownerId: expect.any(String) } });
    await expect(projectsApi.createQuote(quoteInput({ ownerId: "inexistente" }))).rejects.toMatchObject({ status: 422 });
    await expect(projectsApi.createQuote(quoteInput({ clientId: "nope" }))).rejects.toMatchObject({ status: 422, fieldErrors: { clientId: expect.any(String) } });
  });
  it("projeto direto: tipo inválido não derruba (antes era crash), cliente e título validados", async () => {
    await expect(direct({ projectTypeId: "nope" })).rejects.toMatchObject({ status: 422, fieldErrors: { projectTypeId: expect.any(String) } });
    await expect(direct({ title: " " })).rejects.toMatchObject({ status: 422, fieldErrors: { title: expect.any(String) } });
    await expect(direct({ clientId: "nope" })).rejects.toMatchObject({ status: 422, fieldErrors: { clientId: expect.any(String) } });
  });
});

describe("RN-96 — projeto direto avisa a equipe e o Financeiro", () => {
  it("responsável, membro interno e Financeiro recebem; quem criou não", async () => {
    const p = await direct();
    expect(notesFor("usr_carlos", p.code)).toHaveLength(1);
    expect(notesFor("usr_lucas", p.code)).toHaveLength(1);
    expect(loadDb().notifications.some((n) => n.userId === "usr_fernanda" && n.projectId === p.id)).toBe(true);
    expect(notesFor("usr_paula", p.code)).toHaveLength(0);
  });
});

describe("RN-97 — condição de pagamento e parcela 'na entrega' acompanham a proposta e o prazo", () => {
  it("aprovar deduz a condição pelas parcelas (à vista / 50-50 / parcelado)", async () => {
    const { p, prop } = await sentQuote();
    await proposalsApi.approve(prop.id);
    expect(fresh(p.id).paymentCondition).toBe("a_vista");
    const two = await sentQuote([{ amountCents: 500_000, dueRule: "Na aprovação", dueAt: null }, { amountCents: 500_000, dueRule: "Na entrega", dueAt: null }], 1_000_000);
    await proposalsApi.approve(two.prop.id);
    expect(fresh(two.p.id).paymentCondition).toBe("50_50");
    const three = await sentQuote([{ amountCents: 300_000, dueRule: "Na aprovação", dueAt: null }, { amountCents: 300_000, dueRule: "Na entrega", dueAt: null }, { amountCents: 400_000, dueRule: "Na entrega", dueAt: null }], 1_000_000);
    await proposalsApi.approve(three.prop.id);
    expect(fresh(three.p.id).paymentCondition).toBe("parcelado");
  });
  it("proposta sem parcelas ou sem valor não é aprovada", async () => {
    const { prop } = await sentQuote();
    transaction((db) => db.proposalInstallments.filter((i) => i.proposalId === prop.id).forEach((i) => (i.deletedAt = new Date().toISOString())));
    await expect(proposalsApi.approve(prop.id)).rejects.toMatchObject({ status: 422 });
  });
  it("mudar o prazo do projeto recalcula o vencimento previsto da parcela 'na entrega'", async () => {
    const { p, prop } = await sentQuote([{ amountCents: 500_000, dueRule: "Na aprovação", dueAt: null }, { amountCents: 400_000, dueRule: "Na entrega", dueAt: null }], 900_000);
    await proposalsApi.approve(prop.id);
    const delivery = () => loadDb().receivables.find((r) => r.projectId === p.id && /entrega/i.test(r.description))!;
    const approvalRec = loadDb().receivables.find((r) => r.projectId === p.id && /aprova/i.test(r.description))!;
    const before = approvalRec.expectedAt;
    const newDue = new Date(Date.now() + 40 * 86_400_000).toISOString();
    await projectsApi.update(p.id, { dueAt: newDue });
    expect(new Date(delivery().expectedAt).getTime()).toBeGreaterThanOrEqual(new Date(newDue).getTime());
    expect(loadDb().receivables.find((r) => r.id === approvalRec.id)!.expectedAt).toBe(before);
    expect(loadDb().events.some((e) => e.type === "receivable.delivery_rescheduled" && e.projectId === p.id)).toBe(true);
  });
});

describe("RN-98 — trocar o cliente leva os recebíveis previstos junto", () => {
  it("clientId dos recebíveis previstos e o contato de faturamento acompanham", async () => {
    const p = await direct();
    const db = loadDb();
    const other = db.clients.find((c) => c.id !== p.clientId && db.clientContacts.some((k) => k.clientId === c.id))!;
    await projectsApi.update(p.id, { clientId: other.id });
    const after = loadDb();
    expect(after.receivables.filter((r) => r.projectId === p.id).every((r) => r.clientId === other.id)).toBe(true);
    const bc = after.projects.find((x) => x.id === p.id)!.billingContactId;
    expect(bc === null || after.clientContacts.find((c) => c.id === bc)!.clientId === other.id).toBe(true);
  });
});

describe("RN-99 — funil: perdidas em 30 dias, dias parada e avisos ao responsável", () => {
  it("perdida antiga some do quadro, mas a lista (allLost) traz o histórico", async () => {
    const p = await projectsApi.createQuote(quoteInput());
    await projectsApi.markLost(p.id, "Fechou com concorrente");
    expect((await commercialApi.quotes()).items.some((i) => i.id === p.id)).toBe(true);
    transaction((db) => db.events.filter((e) => e.projectId === p.id && e.type === "project.lost").forEach((e) => (e.occurredAt = new Date(Date.now() - 60 * 86_400_000).toISOString())));
    expect((await commercialApi.quotes()).items.some((i) => i.id === p.id)).toBe(false);
    expect((await commercialApi.quotes({ allLost: true })).items.some((i) => i.id === p.id)).toBe(true);
  });
  it("comentário não zera 'dias parada'; mudança de etapa zera", async () => {
    const p = await projectsApi.createQuote(quoteInput());
    transaction((db) => {
      db.projects.find((x) => x.id === p.id)!.enteredAt = new Date(Date.now() - 20 * 86_400_000).toISOString();
      db.events.filter((e) => e.projectId === p.id).forEach((e) => (e.occurredAt = new Date(Date.now() - 20 * 86_400_000).toISOString()));
      db.events.push({ ...db.events.find((e) => e.projectId === p.id)!, id: "ev_x", type: "comment.created", occurredAt: new Date().toISOString() });
    });
    const stalled = async () => (await commercialApi.quotes()).items.find((i) => i.id === p.id)!.stalledDays;
    expect(await stalled()).toBeGreaterThanOrEqual(19);
    await projectsApi.move(p.id, { stageKey: "diagnostico", position: 1 });
    expect(await stalled()).toBe(0);
  });
  it("perder e reabrir avisam o responsável quando outra pessoa age", async () => {
    const p = await projectsApi.createQuote(quoteInput());
    await projectsApi.markLost(p.id, "Orçamento cortado");
    await projectsApi.reopenQuote(p.id);
    expect(notesFor("usr_carlos", "perdida")).toHaveLength(1);
    expect(notesFor("usr_carlos", "reaberta")).toHaveLength(1);
  });
  it("enviar proposta avisa o responsável quando quem envia é outra pessoa", async () => {
    await sentQuote();
    expect(notesFor("usr_carlos", "enviada ao cliente")).toHaveLength(1);
  });
});

describe("RN-100 — tarefas: responsável da equipe, projeto encerrado e aviso de prazo", () => {
  it("não atribui a quem não está na equipe do projeto (422); equipe e responsável podem", async () => {
    const p = await direct();
    await expect(tasksApi.create({ projectId: p.id, title: "Roteiro", assigneeUserId: "usr_marina" })).rejects.toMatchObject({ status: 422 });
    const ok = await tasksApi.create({ projectId: p.id, title: "Layout", assigneeUserId: "usr_lucas" });
    await expect(tasksApi.update(ok.id, { assigneeUserId: "usr_rafael" })).rejects.toMatchObject({ status: 422 });
    await tasksApi.update(ok.id, { assigneeUserId: "usr_carlos" });
    await projectsApi.addMember(p.id, { userId: "usr_marina", memberRole: "roteirista" });
    await tasksApi.update(ok.id, { assigneeUserId: "usr_marina" });
    expect(loadDb().tasks.find((t) => t.id === ok.id)!.assigneeUserId).toBe("usr_marina");
  });
  it("projeto concluído, cancelado ou arquivado não aceita edição de tarefa (canEdit falso e 403)", async () => {
    const p = await direct();
    const t = await tasksApi.create({ projectId: p.id, title: "Ajuste final", assigneeUserId: "usr_lucas" });
    await projectsApi.complete(p.id);
    expect((await tasksApi.get(t.id)).canEdit).toBe(false);
    await expect(tasksApi.update(t.id, { title: "Mudou" })).rejects.toMatchObject({ status: 403 });
  });
  it("mudar o prazo avisa quem executa (não quem mudou)", async () => {
    const p = await direct();
    const t = await tasksApi.create({ projectId: p.id, title: "Entrega parcial", assigneeUserId: "usr_lucas" });
    await tasksApi.update(t.id, { dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    expect(loadDb().notifications.some((n) => n.userId === "usr_lucas" && n.type === "prazo" && n.title.startsWith("Prazo alterado"))).toBe(true);
    as("usr_lucas");
    await tasksApi.update(t.id, { dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
    expect(loadDb().notifications.filter((n) => n.userId === "usr_lucas" && n.title.startsWith("Prazo alterado"))).toHaveLength(1);
  });
});

describe("RN-101 — equipe, aprovações e conclusão", () => {
  it("remover membro: tarefas abertas ficam sem responsável, pessoa e responsável são avisados, custo some do comprometido", async () => {
    const p = await direct();
    const t = await tasksApi.create({ projectId: p.id, title: "Peça 1", assigneeUserId: "usr_lucas" });
    const m = loadDb().projectMembers.find((x) => x.projectId === p.id && x.userId === "usr_lucas")!;
    const r = await projectsApi.removeMember(m.id);
    expect(r.tasksUnassigned).toBeGreaterThanOrEqual(1);
    const after = loadDb();
    expect(after.tasks.find((x) => x.id === t.id)!.assigneeUserId).toBeNull();
    expect(notesFor("usr_lucas", "saiu do projeto")).toHaveLength(1);
    expect(notesFor("usr_carlos", "sem responsável")).toHaveLength(1);
  });
  it("custo de freelancer inativo não entra no comprometido", async () => {
    const db = loadDb();
    const fl = db.freelancers[0];
    const p = await direct({ team: [{ freelancerId: fl.id, memberRole: "designer", agreedAmountCents: 30_000 }] });
    expect((await projectsApi.financials(p.id)).freelancerCostCents).toBe(30_000);
    const m = loadDb().projectMembers.find((x) => x.projectId === p.id && x.freelancerId === fl.id)!;
    await projectsApi.removeMember(m.id);
    expect((await projectsApi.financials(p.id)).freelancerCostCents).toBe(0);
  });
  it("não adiciona pessoas a projeto perdido/cancelado", async () => {
    const p = await direct();
    await projectsApi.cancel(p.id, "Desistência");
    await expect(projectsApi.addMember(p.id, { userId: "usr_marina", memberRole: "roteirista" })).rejects.toMatchObject({ status: 409 });
  });
  it("mover para validação duas vezes não duplica o pedido; sair da etapa retira o pendente sem link", async () => {
    const p = await direct();
    const pending = () => loadDb().approvals.filter((a) => a.projectId === p.id && a.decision === "pendente" && !a.deletedAt && a.stageKey === "validacao_cliente");
    await projectsApi.move(p.id, { stageKey: "validacao_cliente", position: 1 });
    expect(pending()).toHaveLength(1);
    await projectsApi.move(p.id, { stageKey: "design", position: 1 });
    expect(pending()).toHaveLength(0);
    await projectsApi.move(p.id, { stageKey: "validacao_cliente", position: 1 });
    expect(pending()).toHaveLength(1);
  });
  it("'Retirar pedido' tira o pendente da lista e só vale para pendentes", async () => {
    const p = await direct();
    const a = await approvalsApi.request(p.id, { stageKey: "design", requestedFrom: "Cliente" });
    await approvalsApi.withdraw(a.id);
    expect((await approvalsApi.list(p.id)).some((x) => x.id === a.id)).toBe(false);
    await expect(approvalsApi.withdraw(a.id)).rejects.toMatchObject({ status: 404 });
    const b = await approvalsApi.request(p.id, { stageKey: "design", requestedFrom: "Cliente" });
    as("usr_fernanda");
    await expect(approvalsApi.withdraw(b.id)).rejects.toMatchObject({ status: 403 });
  });
  it("concluir pode encerrar as tarefas abertas e retira pedidos de aprovação sem resposta", async () => {
    const p = await direct();
    await tasksApi.create({ projectId: p.id, title: "Sobrou", assigneeUserId: "usr_lucas" });
    await approvalsApi.request(p.id, { stageKey: "design", requestedFrom: "Cliente" });
    await projectsApi.complete(p.id, [], { closeOpenTasks: true });
    const db = loadDb();
    expect(db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt && t.statusKey !== "concluida")).toHaveLength(0);
    expect(db.approvals.filter((a) => a.projectId === p.id && a.decision === "pendente" && !a.deletedAt)).toHaveLength(0);
  });
});
