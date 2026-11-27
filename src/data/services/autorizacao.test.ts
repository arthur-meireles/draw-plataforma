/**
 * RN-30 / RF-M1-04 — o serviço garante a matriz da seção 9 (o front só esconde).
 * Tabela perfil × endpoint: para cada função de escrita (e leituras sensíveis), ao menos um
 * perfil permitido e um negado. Negado = 403 (ou 404 quando o recurso não é visível ao perfil).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import type { Database } from "../types";
import {
  admApi,
  approvalsApi,
  authApi,
  clientsApi,
  driveApi,
  filesApi,
  financeApi,
  freelancersApi,
  importsApi,
  mailApi,
  metricsApi,
  projectsApi,
  proposalsApi,
  proposalsExtraApi,
  tasksApi,
  usersApi,
} from "./index";

const U = { admin: "usr_paula", gestao: "usr_beatriz", comercial: "usr_carlos", financeiro: "usr_fernanda", operacao: "usr_lucas", freelancer: "usr_julia" } as const;
type Who = keyof typeof U;

const db = (): Database => loadDb();
const flOf = (userId: string) => db().freelancers.find((f) => f.userId === userId)!.id;
/** Projeto ativo onde o usuário (ou o freelancer dele) está alocado. */
const activeOf = (userId: string) => {
  const fl = db().freelancers.find((f) => f.userId === userId)?.id;
  const ids = new Set(db().projectMembers.filter((m) => m.active && (m.userId === userId || (fl && m.freelancerId === fl))).map((m) => m.projectId));
  return db().projects.find((p) => p.status === "ativo" && ids.has(p.id) && !p.deletedAt)!;
};
const quote = () => db().projects.find((p) => p.status === "cotacao" && !p.deletedAt)!;
const sentProposal = () => db().proposals.find((pr) => pr.status === "enviada" && db().projects.find((p) => p.id === pr.projectId)?.status === "cotacao")!;
const draftOrNewProposal = () => db().proposals.find((pr) => pr.status === "rascunho" && db().projects.find((p) => p.id === pr.projectId)?.status === "cotacao");
const projectFile = (userId: string) => db().files.find((f) => f.projectId === activeOf(userId).id && !f.deletedAt && f.category !== "proposta" && f.category !== "nf")!;
const unreleasedFileFor = (userId: string) => db().files.find((f) => f.projectId === activeOf(userId).id && !f.deletedAt && !f.releasedToFreelancers)!;
const pendingApproval = () => db().approvals.find((a) => a.decision === "pendente" && db().projects.find((p) => p.id === a.projectId)?.status === "ativo")!;
const projectTask = (userId: string) => db().tasks.find((t) => t.projectId === activeOf(userId).id && !t.deletedAt && t.module === "projeto")!;
const freelancerPayable = () => db().payables.find((p) => p.freelancerId && !p.deletedAt)!;
const txt = (name = "a.txt") => new File(["conteudo"], name, { type: "text/plain" });
const someContact = () => db().clientContacts.find((c) => !c.deletedAt)!;
const contactInput = { name: "Contato Teste", email: "contato@cliente.com.br", phone: null, role: null, isBillingContact: false } as never;

type Case = [endpoint: string, who: Who, call: () => Promise<unknown>, allowed: boolean];

const CASES: Case[] = [
  /* ── Usuários e configurações (admin T · gestão L) ── */
  ["usersApi.list", "gestao", () => usersApi.list(), true],
  ["usersApi.list", "comercial", () => usersApi.list(), false],
  ["usersApi.list", "freelancer", () => usersApi.list(), false],
  ["usersApi.invite", "admin", () => usersApi.invite({ name: "Nova", email: "nova@draw.com.br", role: "operacao" }), true],
  ["usersApi.invite", "gestao", () => usersApi.invite({ name: "Nova", email: "nova@draw.com.br", role: "operacao" }), false],
  ["usersApi.inviteLink", "admin", () => usersApi.inviteLink("usr_convite"), true],
  ["usersApi.inviteLink", "gestao", () => usersApi.inviteLink("usr_convite"), false],
  ["usersApi.resendInvite", "admin", () => usersApi.resendInvite("usr_convite"), true],
  ["usersApi.resendInvite", "comercial", () => usersApi.resendInvite("usr_convite"), false],
  ["usersApi.setStatus", "admin", () => usersApi.setStatus("usr_fernanda", "inativo"), true],
  ["usersApi.setStatus", "gestao", () => usersApi.setStatus("usr_marina", "inativo"), false],
  ["usersApi.update (outra pessoa)", "admin", () => usersApi.update("usr_lucas", { jobTitle: "Diretor de arte" }), true],
  ["usersApi.update (outra pessoa)", "comercial", () => usersApi.update("usr_lucas", { jobTitle: "Diretor de arte" }), false],
  ["usersApi.update (próprio perfil)", "operacao", () => usersApi.update("usr_lucas", { phone: "(11) 90000-0000" }), true],
  ["usersApi.accessLogs", "admin", () => usersApi.accessLogs(), true],
  ["usersApi.accessLogs", "gestao", () => usersApi.accessLogs(), false],
  ["usersApi.updateOrganization", "admin", () => usersApi.updateOrganization({ freelancerPaymentDay: 20, dueSoonDays: 2 }), true],
  ["usersApi.updateOrganization", "gestao", () => usersApi.updateOrganization({ freelancerPaymentDay: 20, dueSoonDays: 2 }), false],
  ["mailApi.systemSettings", "gestao", () => mailApi.systemSettings(), true],
  ["mailApi.systemSettings", "financeiro", () => mailApi.systemSettings(), false],
  ["mailApi.sendSystemTest", "admin", () => mailApi.sendSystemTest("teste@draw.com.br"), true],
  ["mailApi.sendSystemTest", "gestao", () => mailApi.sendSystemTest("teste@draw.com.br"), false],
  ["mailApi.sendSystemTest", "freelancer", () => mailApi.sendSystemTest("teste@draw.com.br"), false],
  ["authApi.resetDemo", "admin", () => authApi.resetDemo(), true],
  ["authApi.resetDemo", "gestao", () => authApi.resetDemo(), false],

  /* ── Administrativo ── */
  ["admApi.resources", "operacao", () => admApi.resources(), true],
  ["admApi.resources", "freelancer", () => admApi.resources(), false],
  ["admApi.saveResource", "gestao", () => admApi.saveResource({ title: "Manual", url: "https://draw.com.br", category: "outros", description: null } as never), true],
  ["admApi.saveResource", "comercial", () => admApi.saveResource({ title: "Manual", url: "https://draw.com.br", category: "outros", description: null } as never), false],
  ["admApi.saveDocument", "admin", () => admApi.saveDocument({ title: "Contrato social", category: "societario" as never, validUntil: null }), true],
  ["admApi.saveDocument", "operacao", () => admApi.saveDocument({ title: "Contrato social", category: "societario" as never, validUntil: null }), false],
  ["admApi.vaultLogs", "admin", () => admApi.vaultLogs(), true],
  ["admApi.vaultLogs", "financeiro", () => admApi.vaultLogs(), false],
  ["admApi.saveVaultItem", "admin", () => admApi.saveVaultItem({ title: "Banco", secret: "x", allowedRoles: [] }), true],
  ["admApi.saveVaultItem", "gestao", () => admApi.saveVaultItem({ title: "Banco", secret: "x", allowedRoles: [] }), false],
  ["tasksApi.sprints", "operacao", () => tasksApi.sprints(), true],
  ["tasksApi.sprints", "freelancer", () => tasksApi.sprints(), false],
  ["tasksApi.create (ADM)", "gestao", () => tasksApi.create({ module: "adm", title: "Renovar certidão" }), true],
  ["tasksApi.create (ADM)", "comercial", () => tasksApi.create({ module: "adm", title: "Renovar certidão" }), false],
  ["metricsApi.companyOverview", "operacao", () => metricsApi.companyOverview(), true],
  ["metricsApi.companyOverview", "freelancer", () => metricsApi.companyOverview(), false],

  /* ── Importação ── */
  ["importsApi.list", "financeiro", () => importsApi.list(), true],
  ["importsApi.list", "operacao", () => importsApi.list(), false],
  ["importsApi.preview (clientes)", "comercial", () => importsApi.preview("clientes", []), true],
  ["importsApi.preview (clientes)", "financeiro", () => importsApi.preview("clientes", []), false],
  ["importsApi.preview (recebíveis)", "financeiro", () => importsApi.preview("recebiveis", []), true],
  ["importsApi.preview (recebíveis)", "comercial", () => importsApi.preview("recebiveis", []), false],

  /* ── Clientes (admin/gestão/comercial T · financeiro/operação L) ── */
  ["clientsApi.groups", "operacao", () => clientsApi.groups(), true],
  ["clientsApi.groups", "freelancer", () => clientsApi.groups(), false],
  ["clientsApi.contacts", "financeiro", () => clientsApi.contacts(someContact().clientId), true],
  ["clientsApi.contacts", "freelancer", () => clientsApi.contacts(someContact().clientId), false],
  ["clientsApi.segments", "freelancer", () => clientsApi.segments(), false],
  ["clientsApi.createGroup", "comercial", () => clientsApi.createGroup("Grupo Novo"), true],
  ["clientsApi.createGroup", "financeiro", () => clientsApi.createGroup("Grupo Novo"), false],
  ["clientsApi.saveContact", "comercial", () => clientsApi.saveContact(someContact().clientId, contactInput), true],
  ["clientsApi.saveContact", "operacao", () => clientsApi.saveContact(someContact().clientId, contactInput), false],
  ["clientsApi.removeContact", "gestao", () => clientsApi.removeContact(someContact().id), true],
  ["clientsApi.removeContact", "financeiro", () => clientsApi.removeContact(someContact().id), false],

  /* ── Freelancers ── */
  ["freelancersApi.invite", "admin", () => freelancersApi.invite(db().freelancers.find((f) => !f.userId)!.id), true],
  ["freelancersApi.invite", "gestao", () => freelancersApi.invite(db().freelancers.find((f) => !f.userId)!.id), false],
  ["financeApi.resendInvoiceLink", "financeiro", () => financeApi.resendInvoiceLink(freelancerPayable().id), true],
  ["financeApi.resendInvoiceLink", "comercial", () => financeApi.resendInvoiceLink(freelancerPayable().id), false],
  ["financeApi.resendInvoiceLink", "freelancer", () => financeApi.resendInvoiceLink(freelancerPayable().id), false],

  /* ── Projetos (financeiro L · operação/freelancer P) ── */
  ["projectsApi.move (ativo)", "operacao", () => projectsApi.move(activeOf(U.operacao).id, { stageKey: activeOf(U.operacao).projectStageKey!, position: 1 }), true],
  ["projectsApi.move (ativo)", "financeiro", () => projectsApi.move(activeOf(U.operacao).id, { stageKey: activeOf(U.operacao).projectStageKey!, position: 1 }), false],
  ["projectsApi.move (ativo)", "freelancer", () => projectsApi.move(activeOf(U.freelancer).id, { stageKey: activeOf(U.freelancer).projectStageKey!, position: 1 }), false],
  ["projectsApi.move (cotação)", "comercial", () => projectsApi.move(quote().id, { stageKey: "negociacao", position: 1 }), true],
  ["projectsApi.move (cotação)", "financeiro", () => projectsApi.move(quote().id, { stageKey: "negociacao", position: 1 }), false],
  ["projectsApi.pause", "gestao", () => projectsApi.pause(activeOf(U.operacao).id, "Aguardando cliente"), true],
  ["projectsApi.pause", "operacao", () => projectsApi.pause(activeOf(U.operacao).id, "Aguardando cliente"), false],
  ["projectsApi.resume", "financeiro", () => projectsApi.resume(activeOf(U.operacao).id), false],
  ["projectsApi.archive", "financeiro", () => projectsApi.archive(activeOf(U.operacao).id), false],
  ["projectsApi.markLost", "comercial", () => projectsApi.markLost(quote().id, "Cliente desistiu"), true],
  ["projectsApi.markLost", "financeiro", () => projectsApi.markLost(quote().id, "Cliente desistiu"), false],
  ["projectsApi.reopenQuote", "financeiro", () => projectsApi.reopenQuote(quote().id), false],
  ["projectsApi.update", "financeiro", () => projectsApi.update(activeOf(U.operacao).id, { title: "Novo título" }), false],
  ["projectsApi.update", "operacao", () => projectsApi.update(activeOf(U.operacao).id, { title: "Novo título" }), true],

  /* ── Propostas (Comercial T + valores) ── */
  ["proposalsApi.create", "comercial", () => proposalsApi.create(quote().id, { amountCents: 1000, installments: [{ amountCents: 1000, dueRule: "Na aprovação", dueAt: null }] }), true],
  ["proposalsApi.create", "financeiro", () => proposalsApi.create(quote().id, { amountCents: 1000, installments: [{ amountCents: 1000, dueRule: "Na aprovação", dueAt: null }] }), false],
  ["proposalsExtraApi.save", "financeiro", () => proposalsExtraApi.save(quote().id, { amountCents: 1000, installments: [{ amountCents: 1000, dueRule: null, dueAt: null }], file: txt("p.pdf") }), false],
  ["proposalsApi.send", "financeiro", () => proposalsApi.send((draftOrNewProposal() ?? sentProposal()).id), false],
  ["proposalsApi.approve", "comercial", () => proposalsApi.approve(sentProposal().id), true],
  ["proposalsApi.approve", "financeiro", () => proposalsApi.approve(sentProposal().id), false],
  ["proposalsApi.reject", "gestao", () => proposalsApi.reject(sentProposal().id), true],
  ["proposalsApi.reject", "financeiro", () => proposalsApi.reject(sentProposal().id), false],

  /* ── Aprovações do cliente ── */
  ["approvalsApi.decide", "gestao", () => approvalsApi.decide(pendingApproval().id, "aprovado"), true],
  ["approvalsApi.decide", "financeiro", () => approvalsApi.decide(pendingApproval().id, "aprovado"), false],
  ["approvalsApi.request", "operacao", () => approvalsApi.request(activeOf(U.operacao).id, { stageKey: "revisao_cliente" as never, requestedFrom: "Cliente" }), true],
  ["approvalsApi.request", "financeiro", () => approvalsApi.request(activeOf(U.operacao).id, { stageKey: "revisao_cliente" as never, requestedFrom: "Cliente" }), false],
  ["approvalsApi.request", "freelancer", () => approvalsApi.request(activeOf(U.freelancer).id, { stageKey: "revisao_cliente" as never, requestedFrom: "Cliente" }), false],

  /* ── Tarefas de projeto (financeiro L) ── */
  ["tasksApi.create (projeto)", "comercial", () => tasksApi.create({ projectId: activeOf(U.operacao).id, title: "Revisar" }), true],
  ["tasksApi.create (projeto)", "financeiro", () => tasksApi.create({ projectId: activeOf(U.operacao).id, title: "Revisar" }), false],
  ["tasksApi.create (subtarefa)", "financeiro", () => tasksApi.create({ projectId: activeOf(U.operacao).id, parentTaskId: projectTask(U.operacao).id, title: "Sub" }), false],
  ["tasksApi.create (subtarefa)", "freelancer", () => tasksApi.create({ projectId: activeOf(U.freelancer).id, parentTaskId: projectTask(U.freelancer).id, title: "Sub" }), true],
  ["tasksApi.update (projeto)", "financeiro", () => tasksApi.update(projectTask(U.operacao).id, { title: "X" }), false],
  ["tasksApi.update (projeto)", "operacao", () => tasksApi.update(projectTask(U.operacao).id, { title: "X" }), true],

  /* ── Arquivos (financeiro L · operação/freelancer P) ── */
  ["filesApi.upload (projeto)", "operacao", () => filesApi.upload({ projectId: activeOf(U.operacao).id, category: "briefing" as never, file: txt() }), true],
  ["filesApi.upload (projeto)", "financeiro", () => filesApi.upload({ projectId: activeOf(U.operacao).id, category: "briefing" as never, file: txt() }), false],
  ["filesApi.upload (NF do recebível)", "financeiro", () => filesApi.upload({ projectId: activeOf(U.operacao).id, category: "nf", file: txt("nf.pdf") }), true],
  ["filesApi.upload (nova versão)", "financeiro", () => filesApi.upload({ fileId: projectFile(U.operacao).id, projectId: activeOf(U.operacao).id, category: projectFile(U.operacao).category, file: txt() }), false],
  ["filesApi.upload (pasta geral)", "operacao", () => filesApi.upload({ module: "adm", category: "outro" as never, file: txt() }), false],
  ["filesApi.setCategory", "gestao", () => filesApi.setCategory(projectFile(U.operacao).id, "referencia" as never), true],
  ["filesApi.setCategory", "financeiro", () => filesApi.setCategory(projectFile(U.operacao).id, "referencia" as never), false],
  ["filesApi.setCategory", "operacao", () => filesApi.setCategory(projectFile(U.operacao).id, "referencia" as never), false],
  ["filesApi.restoreVersion", "admin", () => filesApi.restoreVersion(projectFile(U.operacao).id, projectFile(U.operacao).currentVersionId), true],
  ["filesApi.restoreVersion", "operacao", () => filesApi.restoreVersion(projectFile(U.operacao).id, projectFile(U.operacao).currentVersionId), false],
  ["filesApi.downloadUrl", "admin", () => filesApi.downloadUrl(unreleasedFileFor(U.freelancer).currentVersionId), true],
  ["filesApi.downloadUrl (não liberado)", "freelancer", () => filesApi.downloadUrl(unreleasedFileFor(U.freelancer).currentVersionId), false],
  ["filesApi.remove", "operacao", () => filesApi.remove(projectFile(U.operacao).id), false],
  ["filesApi.setReleased", "financeiro", () => filesApi.setReleased(projectFile(U.operacao).id, true), false],
];

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
});

describe("RN-30 — matriz de permissões garantida no serviço (perfil × endpoint)", () => {
  it.each(CASES)("%s como %s", async (_name, who, call, allowed) => {
    setSessionUserId(U[who]);
    if (allowed) await expect(call()).resolves.not.toThrow();
    else await expect(call()).rejects.toMatchObject({ status: expect.toSatisfy((s: number) => s === 403 || s === 404) });
  });

  it("toda função de escrita listada tem ao menos um caso permitido e um negado", () => {
    const byName = new Map<string, Set<boolean>>();
    CASES.forEach(([name, , , ok]) => byName.set(name.replace(/ \(.*\)$/, ""), (byName.get(name.replace(/ \(.*\)$/, "")) ?? new Set()).add(ok)));
    const onlyDenied = ["projectsApi.resume", "projectsApi.archive", "projectsApi.reopenQuote", "proposalsApi.send", "proposalsExtraApi.save", "filesApi.remove", "filesApi.setReleased", "clientsApi.segments"]; // permitido já coberto em rules.test.ts / fluxos
    for (const [name, outcomes] of byName) {
      expect(outcomes.has(false), `${name} sem caso negado`).toBe(true);
      if (!onlyDenied.includes(name)) expect(outcomes.has(true), `${name} sem caso permitido`).toBe(true);
    }
  });

  it("drive: projeto em leitura (Financeiro) não oferece envio", async () => {
    setSessionUserId(U.financeiro);
    const loc = await driveApi.location(`prj:${activeOf(U.operacao).id}`);
    expect(loc.canUpload).toBe(false);
    setSessionUserId(U.operacao);
    expect((await driveApi.location(`prj:${activeOf(U.operacao).id}`)).canUpload).toBe(true);
  });

  it("freelancer só enxerga o próprio cadastro (escopo P)", async () => {
    setSessionUserId(U.freelancer);
    const rows = await freelancersApi.list();
    expect(rows.map((r) => r.id)).toEqual([flOf(U.freelancer)]);
  });
});
