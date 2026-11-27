/**
 * Comercial/Projetos — desarquivar (RN-50), envio ao cliente por link (RN-51/52) e Caixa de entrada (RN-53/54).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb, transaction } from "../db";
import { setSessionUserId } from "./_core";
import { approvalsApi, clientLinksApi, commentsApi, projectsApi, proposalsApi, publicClientLinkApi, tasksApi } from "./index";

const as = (userId: string) => setSessionUserId(userId);
const typeByPrefix = (p: string) => loadDb().projectTypes.find((t) => t.codePrefix === p)!;
const clientWithContact = () => {
  const db = loadDb();
  return db.clients.find((c) => db.clientContacts.some((k) => k.clientId === c.id && k.email))!;
};
const notesOf = (userId: string) => loadDb().notifications.filter((n) => n.userId === userId);

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as("usr_paula");
});

async function quoteWithSentProposal(owner = "usr_carlos") {
  const p = await projectsApi.createQuote({ clientId: clientWithContact().id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: owner });
  const prop = await proposalsApi.create(p.id, { amountCents: 900_000, installments: [{ amountCents: 900_000, dueRule: "Na aprovação", dueAt: null }] });
  await proposalsApi.send(prop.id);
  const link = loadDb().shareLinks.find((l) => l.purpose === "proposta" && l.targetId === prop.id)!;
  return { p, prop, link };
}

/** Projeto ativo com um freelancer com acesso (usr_julia) e um arquivo de entrega. */
async function activeProject() {
  const db = loadDb();
  const julia = db.freelancers.find((f) => f.userId === "usr_julia")!;
  const p = await projectsApi.createDirect({
    clientId: clientWithContact().id,
    projectTypeId: typeByPrefix("APR").id,
    title: "Contrato visual",
    ownerId: "usr_carlos",
    contractedAmountCents: 100_000,
    installments: [{ description: "Única", amountCents: 100_000, expectedAt: new Date().toISOString() }],
    team: [
      { userId: "usr_lucas", memberRole: "designer" },
      { freelancerId: julia.id, memberRole: "designer", agreedAmountCents: 50_000 },
    ],
    dueAt: null,
  });
  const fileId = `file_t${Math.random().toString(36).slice(2, 8)}`;
  transaction((d) => {
    d.fileVersions.push({ id: `fv_${fileId}`, organizationId: "org_draw", createdAt: "", updatedAt: "", createdBy: "usr_lucas", deletedAt: null, fileId, version: 1, storageKey: "x", size: 10, mime: "application/pdf", sha256: "0", uploadedBy: "usr_lucas", note: null, dataUrl: null });
    d.files.push({ id: fileId, organizationId: "org_draw", createdAt: "", updatedAt: "", createdBy: "usr_lucas", deletedAt: null, projectId: p.id, clientId: p.clientId, module: "projeto", taskId: null, category: "entrega", name: "Contrato v1.pdf", currentVersionId: `fv_${fileId}`, releasedToFreelancers: true, folderId: null });
  });
  return { p, fileId, julia };
}

describe("RN-50 — desarquivar volta ao status anterior", () => {
  it("cancelado → arquivado → cancelado; concluído e perdido também voltam a si mesmos", async () => {
    const { p } = await activeProject();
    await projectsApi.cancel(p.id, "Cliente desistiu");
    await projectsApi.archive(p.id);
    expect(loadDb().projects.find((x) => x.id === p.id)!.statusBeforeArchive).toBe("cancelado");
    await projectsApi.unarchive(p.id);
    const back = loadDb().projects.find((x) => x.id === p.id)!;
    expect(back.status).toBe("cancelado");
    expect(back.statusBeforeArchive).toBeNull();

    const { p: q } = await quoteWithSentProposal();
    await projectsApi.markLost(q.id, "Preço");
    await projectsApi.archive(q.id);
    await projectsApi.unarchive(q.id);
    expect(loadDb().projects.find((x) => x.id === q.id)!.status).toBe("perdido");

    const { p: c } = await activeProject();
    await projectsApi.complete(c.id);
    await projectsApi.archive(c.id);
    await projectsApi.unarchive(c.id);
    expect(loadDb().projects.find((x) => x.id === c.id)!.status).toBe("concluido");
  });

  it("registros antigos sem statusBeforeArchive: cancelado é deduzido pelo evento", async () => {
    const { p } = await activeProject();
    await projectsApi.cancel(p.id, "Motivo");
    await projectsApi.archive(p.id);
    transaction((db) => (db.projects.find((x) => x.id === p.id)!.statusBeforeArchive = null));
    await projectsApi.unarchive(p.id);
    expect(loadDb().projects.find((x) => x.id === p.id)!.status).toBe("cancelado");
  });

  it("arquivar/desarquivar exige permissão de projetos", async () => {
    const { p } = await activeProject();
    await projectsApi.cancel(p.id, "Motivo");
    as("usr_lucas");
    await expect(projectsApi.archive(p.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-51 — proposta enviada ao cliente por link", () => {
  it("cria link de 30 dias e e-mail transacional ao contato do cliente", async () => {
    const { p, link } = await quoteWithSentProposal();
    expect(link).toBeTruthy();
    expect(link.recipients.length).toBeGreaterThan(0);
    expect(new Date(link.expiresAt).getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    const mail = loadDb().emailLogs.find((m) => m.template === "proposta_cliente" && m.projectId === p.id);
    expect(mail?.to).toEqual(link.recipients);
  });

  it("cliente aprova pelo link → mesmo caminho da RN-01, registra via link e avisa o responsável", async () => {
    const { p, link } = await quoteWithSentProposal();
    setSessionUserId(null);
    const view = await publicClientLinkApi.get(link.token);
    expect(view.canRespond).toBe(true);
    expect(view.proposal?.amountCents).toBe(900_000);
    await expect(publicClientLinkApi.respond(link.token, { decision: "aprovado", name: "" })).rejects.toMatchObject({ status: 422 });
    await publicClientLinkApi.respond(link.token, { decision: "aprovado", name: "Maria Cliente" });
    const db = loadDb();
    const proj = db.projects.find((x) => x.id === p.id)!;
    expect(proj.status).toBe("ativo");
    expect(db.receivables.filter((r) => r.projectId === p.id)).toHaveLength(1);
    const ev = db.events.find((e) => e.type === "proposal.approved" && e.projectId === p.id)!;
    expect(ev.data.via).toBe("link_cliente");
    expect(ev.data.respondentName).toBe("Maria Cliente");
    expect(db.shareLinks.find((l) => l.id === link.id)!.viewedAt).not.toBeNull();
    expect(notesOf("usr_carlos").some((n) => n.type === "cliente" && n.projectId === p.id)).toBe(true);
    await expect(publicClientLinkApi.respond(link.token, { decision: "aprovado", name: "Maria" })).rejects.toMatchObject({ status: 409 });
  });

  it("pedir ajustes exige comentário, vai para negociação e avisa o responsável", async () => {
    const { p, link } = await quoteWithSentProposal();
    setSessionUserId(null);
    await expect(publicClientLinkApi.respond(link.token, { decision: "ajustes", name: "Maria" })).rejects.toMatchObject({ status: 422 });
    await publicClientLinkApi.respond(link.token, { decision: "ajustes", name: "Maria", comment: "Reduzir o escopo" });
    const db = loadDb();
    expect(db.projects.find((x) => x.id === p.id)!.quoteStageKey).toBe("negociacao");
    expect(db.events.some((e) => e.type === "proposal.adjustments_requested" && e.data.comment === "Reduzir o escopo")).toBe(true);
    expect(notesOf("usr_carlos").some((n) => n.type === "cliente" && n.body?.includes("Reduzir o escopo"))).toBe(true);
  });

  it("link revogado ou expirado não abre; reenviar renova", async () => {
    const { p, link } = await quoteWithSentProposal();
    await clientLinksApi.revoke(link.id);
    await expect(publicClientLinkApi.get(link.token)).rejects.toMatchObject({ status: 409 });
    expect((await clientLinksApi.list(p.id))[0].status).toBe("revogado");
    await clientLinksApi.resend(link.id);
    expect((await publicClientLinkApi.get(link.token)).canRespond).toBe(true);
    transaction((db) => (db.shareLinks.find((l) => l.id === link.id)!.expiresAt = new Date(Date.now() - 1000).toISOString()));
    await expect(publicClientLinkApi.get(link.token)).rejects.toMatchObject({ status: 409 });
    expect((await clientLinksApi.list(p.id))[0].status).toBe("expirado");
  });

  it("Financeiro não envia nem aprova proposta (comercial = L)", async () => {
    const p = await projectsApi.createQuote({ clientId: clientWithContact().id, projectTypeId: typeByPrefix("APR").id, title: "X", ownerId: "usr_carlos" });
    const prop = await proposalsApi.create(p.id, { amountCents: 100, installments: [{ amountCents: 100, dueRule: null, dueAt: null }] });
    as("usr_fernanda");
    await expect(proposalsApi.send(prop.id)).rejects.toMatchObject({ status: 403 });
    as("usr_paula");
    await proposalsApi.send(prop.id);
    as("usr_fernanda");
    await expect(proposalsApi.approve(prop.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-52 — aprovação e entrega ao cliente por link", () => {
  it("cliente decide a aprovação: registra na Approval e avisa quem pediu, o responsável e o freelancer", async () => {
    const { p, fileId } = await activeProject();
    as("usr_lucas");
    const r = await clientLinksApi.requestApproval(p.id, { stageKey: "roteiro", fileIds: [fileId] });
    expect(notesOf("usr_carlos").some((n) => n.type === "aprovacao" && n.entityId === r.approval.id)).toBe(true);
    const link = loadDb().shareLinks.find((l) => l.id === r.linkId)!;
    expect(link.purpose).toBe("aprovacao");
    setSessionUserId(null);
    const view = await publicClientLinkApi.get(link.token);
    expect(view.files.map((f) => f.name)).toEqual(["Contrato v1.pdf"]);
    await publicClientLinkApi.respond(link.token, { decision: "ajustes", name: "João", comment: "Trocar a cor" });
    const a = loadDb().approvals.find((x) => x.id === r.approval.id)!;
    expect(a).toMatchObject({ decision: "ajustes", reason: "Trocar a cor", decidedVia: "link_cliente", decidedByName: "João", decidedBy: null });
    for (const uid of ["usr_lucas", "usr_carlos", "usr_julia"]) expect(notesOf(uid).some((n) => n.type === "cliente" && n.entityId === a.id)).toBe(true);
    as("usr_paula");
    await expect(approvalsApi.decide(a.id, "aprovado")).rejects.toMatchObject({ status: 409 });
  });

  it("entrega: só arquivos do projeto (nunca NF/proposta); freelancer não envia", async () => {
    const { p, fileId } = await activeProject();
    await clientLinksApi.sendDelivery(p.id, { fileIds: [fileId] });
    expect(loadDb().emailLogs.some((m) => m.template === "entrega_cliente" && m.projectId === p.id)).toBe(true);
    const list = await clientLinksApi.list(p.id);
    expect(list[0]).toMatchObject({ purpose: "entrega", status: "enviado" });
    await expect(clientLinksApi.sendDelivery(p.id, { fileIds: ["nao-existe"] })).rejects.toMatchObject({ status: 422 });
    as("usr_julia");
    await expect(clientLinksApi.sendDelivery(p.id, { fileIds: [fileId] })).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-53/54 — Caixa de entrada do que envolve a pessoa", () => {
  it("mudança de etapa, pausa, retomada e cancelamento avisam responsável e equipe (com freelancer), nunca quem agiu", async () => {
    const { p } = await activeProject();
    await projectsApi.move(p.id, { stageKey: "design", position: 0 });
    await projectsApi.pause(p.id, "Aguardando cliente");
    await projectsApi.resume(p.id);
    await projectsApi.cancel(p.id, "Desistência");
    for (const uid of ["usr_carlos", "usr_lucas", "usr_julia"]) {
      const types = notesOf(uid).filter((n) => n.projectId === p.id).map((n) => n.title);
      expect(types).toEqual(expect.arrayContaining(["Projeto movido para Design", "Projeto pausado", "Projeto retomado", "Projeto cancelado"]));
    }
    expect(notesOf("usr_paula").some((n) => n.projectId === p.id)).toBe(false);
  });

  it("Administrador recebe o que envolve ele (responsável pelo projeto)", async () => {
    as("usr_beatriz");
    const p = await projectsApi.createQuote({ clientId: clientWithContact().id, projectTypeId: typeByPrefix("APR").id, title: "Admin dono", ownerId: "usr_paula" });
    expect(notesOf("usr_paula").some((n) => n.projectId === p.id && n.type === "atribuicao")).toBe(true);
  });

  it("menção por id (inclui freelancer da equipe, ignora quem não vê o projeto) e comentário avisa responsável e tarefa", async () => {
    const { p } = await activeProject();
    const task = await tasksApi.create({ projectId: p.id, title: "Diagramar", assigneeUserId: "usr_lucas" });
    as("usr_beatriz");
    await commentsApi.create({ projectId: p.id, taskId: task.id, body: "@Júlia Martins veja", mentions: ["usr_julia", "usr_pedro"] });
    expect(notesOf("usr_julia").some((n) => n.type === "mencao" && n.entityId === task.id)).toBe(true);
    expect(notesOf("usr_pedro").some((n) => n.type === "mencao")).toBe(false);
    expect(notesOf("usr_carlos").some((n) => n.type === "comentario" && n.projectId === p.id)).toBe(true);
    expect(notesOf("usr_lucas").some((n) => n.type === "comentario" && n.entityId === task.id)).toBe(true);
    expect(notesOf("usr_julia").some((n) => n.type === "comentario")).toBe(false); // mencionada não recebe em dobro
  });

  it("tarefa em revisão avisa responsável do projeto e quem criou a tarefa", async () => {
    const { p } = await activeProject();
    as("usr_beatriz");
    const task = await tasksApi.create({ projectId: p.id, title: "Revisar textos", assigneeUserId: "usr_lucas" });
    as("usr_lucas");
    await tasksApi.update(task.id, { statusKey: "em_revisao" });
    expect(notesOf("usr_carlos").some((n) => n.type === "revisao" && n.entityId === task.id)).toBe(true);
    expect(notesOf("usr_beatriz").some((n) => n.type === "revisao" && n.entityId === task.id)).toBe(true);
    expect(notesOf("usr_lucas").some((n) => n.type === "revisao")).toBe(false);
  });

  it("menções sempre chegam, mesmo com a preferência desligada", async () => {
    const { p } = await activeProject();
    transaction((db) => db.notificationPreferences.filter((x) => x.userId === "usr_lucas").forEach((x) => (x.enabled = false)));
    await commentsApi.create({ projectId: p.id, body: "@Lucas Prado oi", mentions: ["usr_lucas"] });
    expect(notesOf("usr_lucas").some((n) => n.type === "mencao")).toBe(true);
    expect(notesOf("usr_lucas").some((n) => n.type === "comentario")).toBe(false);
  });
});
