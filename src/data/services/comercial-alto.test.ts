/**
 * Comercial/Projetos/Tarefas — furos altos da onda 2 (RN-13, RN-55..59, RN-70..74).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { approvalsApi, financeApi, projectLifecycleApi, projectsApi, proposalsApi, tasksApi } from "./index";

const as = (userId: string) => setSessionUserId(userId);
const typeByPrefix = (p: string) => loadDb().projectTypes.find((t) => t.codePrefix === p)!;
const clientWithContact = () => {
  const db = loadDb();
  return db.clients.find((c) => db.clientContacts.some((k) => k.clientId === c.id && k.email))!;
};
const fresh = (id: string) => loadDb().projects.find((x) => x.id === id)!;

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as("usr_paula");
});

async function quoteWithSentProposal(owner = "usr_carlos") {
  const p = await projectsApi.createQuote({ clientId: clientWithContact().id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: owner });
  const prop = await proposalsApi.create(p.id, { amountCents: 900_000, installments: [{ amountCents: 900_000, dueRule: "Na aprovação", dueAt: null }] });
  await proposalsApi.send(prop.id);
  return { p, prop };
}

async function directProject(extra: Partial<Parameters<typeof projectsApi.createDirect>[0]> = {}) {
  return projectsApi.createDirect({
    clientId: clientWithContact().id,
    projectTypeId: typeByPrefix("APR").id,
    title: "Contrato visual",
    ownerId: "usr_carlos",
    contractedAmountCents: 100_000,
    installments: [{ description: "Única", amountCents: 100_000, expectedAt: new Date().toISOString() }],
    team: [{ userId: "usr_lucas", memberRole: "designer" }],
    dueAt: null,
    ...extra,
  });
}

describe("RN-13 — projeto pausado não muda etapa", () => {
  it("move para outra etapa responde 409; reordenar na mesma etapa continua", async () => {
    const p = await directProject();
    await projectsApi.pause(p.id, "Cliente viajando");
    await expect(projectsApi.move(p.id, { stageKey: "design", position: 1 })).rejects.toMatchObject({ status: 409 });
    await projectsApi.move(p.id, { stageKey: "roteiro", position: 5 });
    expect(fresh(p.id).position).toBe(5);
    await projectsApi.resume(p.id);
    await projectsApi.move(p.id, { stageKey: "design", position: 1 });
    expect(fresh(p.id).projectStageKey).toBe("design");
  });
});

describe("RN-55 — trocar o responsável o coloca na equipe", () => {
  it("novo responsável vira membro `responsavel` e o anterior fica como `apoio`", async () => {
    const p = await directProject();
    await projectsApi.update(p.id, { ownerId: "usr_beatriz" });
    const ms = loadDb().projectMembers.filter((m) => m.projectId === p.id && m.active && !m.deletedAt);
    expect(ms.find((m) => m.userId === "usr_beatriz")?.memberRole).toBe("responsavel");
    expect(ms.find((m) => m.userId === "usr_carlos")?.memberRole).toBe("apoio");
    expect(loadDb().events.some((e) => e.type === "project.owner_changed" && e.projectId === p.id)).toBe(true);
  });
  it("responsável precisa ser interno e ativo", async () => {
    const p = await directProject();
    await expect(projectsApi.update(p.id, { ownerId: "usr_julia" })).rejects.toMatchObject({ status: 422 });
  });
});

describe("RN-56 — escopo de edição da Operação", () => {
  it("Operação edita prazo/prioridade, mas não responsável, cliente, faturamento ou valores", async () => {
    const p = await directProject();
    as("usr_lucas");
    await projectsApi.update(p.id, { priorityKey: "alta", dueAt: new Date().toISOString() });
    expect(fresh(p.id).priorityKey).toBe("alta");
    await expect(projectsApi.update(p.id, { ownerId: "usr_lucas" })).rejects.toMatchObject({ status: 403 });
    await expect(projectsApi.update(p.id, { paymentCondition: "a_vista" })).rejects.toMatchObject({ status: 403 });
    await expect(projectsApi.update(p.id, { billingContactId: null })).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-57 — Minhas tarefas", () => {
  it("inclui subtarefas atribuídas a mim, com o título da tarefa-pai", async () => {
    const p = await directProject();
    const parent = await tasksApi.create({ projectId: p.id, title: "Peça principal", assigneeUserId: "usr_carlos" });
    await tasksApi.create({ projectId: p.id, parentTaskId: parent.id, title: "Revisar ícones", assigneeUserId: "usr_lucas" });
    as("usr_lucas");
    const mine = await tasksApi.list({ assignee: "me" });
    const sub = mine.find((t) => t.title === "Revisar ícones");
    expect(sub?.parentTitle).toBe("Peça principal");
  });
  it("projeto pausado não conta como atrasado; encerrado sai da lista por padrão", async () => {
    const p = await directProject();
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString();
    await tasksApi.create({ projectId: p.id, title: "Atrasada", assigneeUserId: "usr_lucas", dueAt: past });
    await projectsApi.pause(p.id, "Aguardando cliente");
    as("usr_lucas");
    let t = (await tasksApi.list({ assignee: "me" })).find((x) => x.title === "Atrasada")!;
    expect(t.isOverdue).toBe(false);
    expect(t.projectOnHold).toBe(true);
    as("usr_paula");
    await projectsApi.cancel(p.id, "Cliente desistiu");
    as("usr_lucas");
    expect((await tasksApi.list({ assignee: "me" })).some((x) => x.title === "Atrasada")).toBe(false);
    t = (await tasksApi.list({ assignee: "me", includeClosedProjects: true })).find((x) => x.title === "Atrasada")!;
    expect(t.projectStatus).toBe("cancelado");
  });
});

describe("RN-58 — desfazer aprovação", () => {
  it("volta para cotação/negociação, remove recebíveis previstos e tarefas abertas, proposta volta a enviada", async () => {
    const { p, prop } = await quoteWithSentProposal();
    await proposalsApi.approve(prop.id);
    expect(loadDb().tasks.filter((t) => t.projectId === p.id && !t.deletedAt).length).toBeGreaterThan(0);
    const preview = await projectLifecycleApi.undoApprovalPreview(p.id);
    expect(preview.allowed).toBe(true);
    await expect(projectLifecycleApi.undoApproval(p.id, { reason: "" })).rejects.toMatchObject({ status: 422 });
    await projectLifecycleApi.undoApproval(p.id, { reason: "Versão errada aprovada" });
    const db = loadDb();
    const back = db.projects.find((x) => x.id === p.id)!;
    expect(back.status).toBe("cotacao");
    expect(back.quoteStageKey).toBe("negociacao");
    expect(back.contractedAmountCents).toBeNull();
    expect(db.proposals.find((x) => x.id === prop.id)!.status).toBe("enviada");
    expect(db.receivables.filter((r) => r.projectId === p.id && !r.deletedAt)).toHaveLength(0);
    expect(db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt && t.statusKey !== "concluida")).toHaveLength(0);
    expect(db.events.some((e) => e.type === "proposal.approval_undone" && e.projectId === p.id)).toBe(true);
    // pode aprovar de novo
    await proposalsApi.approve(prop.id);
    expect(loadDb().projects.find((x) => x.id === p.id)!.status).toBe("ativo");
  });
  it("bloqueia com recebível faturado e para quem não é Comercial/Projetos T", async () => {
    const { p, prop } = await quoteWithSentProposal();
    await proposalsApi.approve(prop.id);
    as("usr_fernanda");
    await expect(projectLifecycleApi.undoApproval(p.id, { reason: "x" })).rejects.toMatchObject({ status: 403 });
    const rec = loadDb().receivables.find((r) => r.projectId === p.id)!;
    await financeApi.issueInvoice(rec.id, { invoiceNumber: "123", issuedAt: new Date().toISOString() });
    as("usr_paula");
    expect((await projectLifecycleApi.undoApprovalPreview(p.id)).allowed).toBe(false);
    await expect(projectLifecycleApi.undoApproval(p.id, { reason: "x" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("RN-59 — reabrir projeto concluído", () => {
  it("volta a ativo em validação, mantém contas a pagar e registra o motivo", async () => {
    const p = await directProject();
    await projectsApi.complete(p.id);
    await expect(projectLifecycleApi.reopenCompleted(p.id, " ")).rejects.toMatchObject({ status: 422 });
    await projectLifecycleApi.reopenCompleted(p.id, "Cliente pediu ajuste depois da entrega");
    const back = fresh(p.id);
    expect(back.status).toBe("ativo");
    expect(back.projectStageKey).toBe("validacao_cliente");
    expect(back.completedAt).toBeNull();
    const ev = loadDb().events.find((e) => e.type === "project.reopened" && e.projectId === p.id)!;
    expect(ev.data.kind).toBe("concluido");
    as("usr_lucas");
    await expect(projectLifecycleApi.reopenCompleted(p.id, "x")).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-70 — reativar projeto cancelado", () => {
  it("volta a ativo na mesma etapa e devolve os recebíveis cancelados pelo cancelamento", async () => {
    const p = await directProject();
    await projectsApi.move(p.id, { stageKey: "design", position: 1 });
    await projectsApi.cancel(p.id, "Cliente desistiu");
    expect(loadDb().receivables.filter((r) => r.projectId === p.id).every((r) => r.status === "cancelado")).toBe(true);
    await projectLifecycleApi.reactivateCancelled(p.id, "Cliente voltou atrás");
    const back = fresh(p.id);
    expect(back.status).toBe("ativo");
    expect(back.projectStageKey).toBe("design");
    expect(back.lostReason).toBeNull();
    expect(loadDb().receivables.filter((r) => r.projectId === p.id).every((r) => r.status === "previsto")).toBe(true);
    await expect(projectLifecycleApi.reactivateCancelled(p.id, "de novo")).rejects.toMatchObject({ status: 409 });
  });
});

describe("RN-71 — recusa só de enviada; rascunho é descartado", () => {
  it("descarta rascunho, não recusa rascunho nem proposta aprovada, e guarda o motivo da recusa", async () => {
    const { p, prop } = await quoteWithSentProposal();
    const draft = await proposalsApi.create(p.id, { amountCents: 500_000, installments: [{ amountCents: 500_000, dueRule: "Na aprovação", dueAt: null }] });
    await expect(proposalsApi.reject(draft.id)).rejects.toMatchObject({ status: 409 });
    await proposalsApi.discard(draft.id);
    expect((await proposalsApi.listByProject(p.id)).some((x) => x.id === draft.id)).toBe(false);
    await proposalsApi.reject(prop.id, "Preço alto");
    expect(loadDb().events.find((e) => e.type === "proposal.rejected" && e.entityId === prop.id)?.data.reason).toBe("Preço alto");
    await expect(proposalsApi.discard(prop.id)).rejects.toMatchObject({ status: 409 });
    const { prop: other } = await quoteWithSentProposal();
    await proposalsApi.approve(other.id);
    await expect(proposalsApi.reject(other.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("RN-72/73 — tarefas do modelo por papel e no prazo; cotação com tarefas", () => {
  it("cotação nasce com tarefas do responsável; ao aprovar elas são encerradas", async () => {
    const { p, prop } = await quoteWithSentProposal();
    const quoteTasks = loadDb().tasks.filter((t) => t.projectId === p.id && !t.deletedAt);
    expect(quoteTasks.map((t) => t.title)).toContain("Elaborar proposta");
    expect(quoteTasks.every((t) => t.assigneeUserId === "usr_carlos")).toBe(true);
    await proposalsApi.approve(prop.id);
    const after = loadDb().tasks.filter((t) => quoteTasks.some((q) => q.id === t.id));
    expect(after.every((t) => t.statusKey === "concluida")).toBe(true);
  });
  it("tarefas de design vão para o designer da equipe; sem o papel, para o responsável; datas até o prazo", async () => {
    const due = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const p = await directProject({ dueAt: due });
    const tasks = loadDb().tasks.filter((t) => t.projectId === p.id && !t.deletedAt);
    const design = tasks.filter((t) => t.stageKey === "design" || t.stageKey === "ajustes_design");
    const roteiro = tasks.filter((t) => t.stageKey === "roteiro" || t.stageKey === "ajustes_roteiro");
    expect(design.length).toBeGreaterThan(0);
    expect(design.every((t) => t.assigneeUserId === "usr_lucas")).toBe(true);
    expect(roteiro.every((t) => t.assigneeUserId === "usr_carlos")).toBe(true);
    expect(tasks.every((t) => new Date(t.dueAt!).getTime() <= new Date(due).getTime() + 1000)).toBe(true);
    expect(tasks.some((t) => t.dueAt === due)).toBe(true);
  });
  it("papel definido no modelo prevalece e resolve freelancer da equipe", async () => {
    const db = loadDb();
    const julia = db.freelancers.find((f) => f.userId === "usr_julia")!;
    const type = typeByPrefix("APR");
    const { projectTypesApi } = await import("./index");
    await projectTypesApi.save({ name: type.name, codePrefix: type.codePrefix, description: type.description ?? null, icon: type.icon, active: true, templates: [{ stageKey: "roteiro", title: "Roteiro com freelancer", defaultDurationDays: 2, defaultRole: "designer" }] }, type.id);
    const p = await directProject({ team: [{ freelancerId: julia.id, memberRole: "designer", agreedAmountCents: 10_000 }] });
    const t = loadDb().tasks.find((x) => x.projectId === p.id && x.title === "Roteiro com freelancer")!;
    expect(t.assigneeFreelancerId).toBe(julia.id);
    expect(loadDb().notifications.some((n) => n.userId === "usr_julia" && n.entityId === t.id)).toBe(true);
  });
});

describe("RN-74 — decisão de aprovação move a etapa", () => {
  it("aprovado no roteiro avança para design; ajustes no design volta para ajustes de design", async () => {
    const p = await directProject();
    const a1 = await approvalsApi.request(p.id, { stageKey: "roteiro", requestedFrom: "Cliente" });
    await approvalsApi.decide(a1.id, "aprovado");
    expect(fresh(p.id).projectStageKey).toBe("design");
    const a2 = await approvalsApi.request(p.id, { stageKey: "design", requestedFrom: "Cliente" });
    await approvalsApi.decide(a2.id, "ajustes", "Trocar a paleta");
    expect(fresh(p.id).projectStageKey).toBe("ajustes_design");
    expect(loadDb().events.some((e) => e.type === "project.stage_changed" && e.projectId === p.id && e.data.via === "aprovacao")).toBe(true);
  });
  it("validação aprovada não conclui sozinha; aprovação de etapa antiga ou projeto pausado não move", async () => {
    const p = await directProject();
    await projectsApi.move(p.id, { stageKey: "validacao_cliente", position: 1 });
    const pending = loadDb().approvals.find((a) => a.projectId === p.id && a.decision === "pendente")!;
    await approvalsApi.decide(pending.id, "aprovado");
    expect(fresh(p.id).status).toBe("ativo");
    expect(fresh(p.id).projectStageKey).toBe("validacao_cliente");
    expect(loadDb().notifications.some((n) => n.userId === "usr_carlos" && n.title.includes("pronto para concluir"))).toBe(true);
    const old = await approvalsApi.request(p.id, { stageKey: "roteiro", requestedFrom: "Cliente" });
    await approvalsApi.decide(old.id, "ajustes", "x");
    expect(fresh(p.id).projectStageKey).toBe("validacao_cliente");
    const again = await approvalsApi.request(p.id, { stageKey: "validacao_cliente", requestedFrom: "Cliente" });
    await projectsApi.pause(p.id, "Férias");
    await approvalsApi.decide(again.id, "ajustes", "y");
    expect(fresh(p.id).projectStageKey).toBe("validacao_cliente");
  });
});
