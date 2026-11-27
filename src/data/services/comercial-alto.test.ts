/**
 * Comercial/Projetos/Tarefas — furos altos da onda 2 (RN-13, RN-55..59, RN-70..74).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { projectsApi, proposalsApi } from "./index";

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
