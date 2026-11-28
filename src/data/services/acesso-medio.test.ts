/**
 * Furos médios de Acesso, Administrativo e Plataforma (onda 3): bloqueio de login persistente (RN-75),
 * sessão por inatividade e encerrar outras sessões (RN-75), avisos de segurança (RN-75).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDb, resetDb, transaction } from "../db";
import { SESSION_IDLE_MS, setSessionUserId } from "./_core";
import { admApi, admExtraApi, filesApi, mailApi, authApi, notificationsApi, tasksApi, usersApi } from "./index";

const as = (userId: string | null) => setSessionUserId(userId);

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as(null);
});

describe("RN-75 — bloqueio por tentativas", () => {
  const fail = async (email = "lucas@draw.com.br") => authApi.login(email, "errada").catch((e) => e);

  it("5 falhas bloqueiam a conta, ficam no log e avisam os administradores", async () => {
    for (let i = 0; i < 4; i++) expect(await fail()).toMatchObject({ status: 401 });
    const fifth = await fail();
    expect(fifth).toMatchObject({ status: 403 });
    expect(fifth.message).toMatch(/Tente de novo em \d+ minuto/);
    // mesmo com a senha certa, continua bloqueada
    await expect(authApi.login("lucas@draw.com.br", "draw123")).rejects.toMatchObject({ status: 403 });
    const db = loadDb();
    expect(db.accessLogs.filter((l) => l.action === "login_failed" && l.detail === "lucas@draw.com.br")).toHaveLength(5);
    expect(db.accessLogs.filter((l) => l.action === "login_blocked")).toHaveLength(1);
    expect(db.notifications.some((n) => n.userId === "usr_paula" && n.type === "seguranca" && /bloqueada/.test(n.title))).toBe(true);
  });

  it("persiste (vive no banco, não na memória) e expira com o tempo", async () => {
    for (let i = 0; i < 5; i++) await fail();
    // "recarregar a página": o bloqueio continua porque está no log de acessos
    await expect(authApi.login("lucas@draw.com.br", "draw123")).rejects.toMatchObject({ status: 403 });
    transaction((db) => db.accessLogs.filter((l) => l.action === "login_failed").forEach((l) => (l.at = new Date(Date.now() - 20 * 60_000).toISOString())));
    const ok = await authApi.login("lucas@draw.com.br", "draw123");
    expect(ok.mfaRequired).toBe(false);
  });

  it("login certo zera a contagem", async () => {
    for (let i = 0; i < 3; i++) await fail();
    await authApi.login("lucas@draw.com.br", "draw123");
    for (let i = 0; i < 4; i++) expect(await fail()).toMatchObject({ status: 401 });
  });
});

describe("RN-75 — sessão", () => {
  it("expira depois de 8 h sem uso e renova a cada chamada", async () => {
    as("usr_lucas");
    expect((await authApi.me())?.id).toBe("usr_lucas");
    window.localStorage.setItem("draw:session:at", String(Date.now() - SESSION_IDLE_MS - 1000));
    expect(await authApi.me()).toBeNull();
    window.localStorage.setItem("draw:session:at", String(Date.now() - SESSION_IDLE_MS + 60_000));
    await usersApi.accessLogs().catch(() => null); // qualquer chamada autenticada
    expect(Number(window.localStorage.getItem("draw:session:at"))).toBeGreaterThan(Date.now() - 5000);
  });

  it("encerrar outras sessões derruba as demais e mantém a atual", async () => {
    const { sessionsApi } = await import("./index");
    as("usr_lucas");
    const staleVersion = window.localStorage.getItem("draw:session:v");
    await sessionsApi.revokeOthers();
    expect((await authApi.me())?.id).toBe("usr_lucas");
    window.localStorage.setItem("draw:session:v", staleVersion ?? "0"); // outro aparelho, com a versão antiga
    expect(await authApi.me()).toBeNull();
    expect(loadDb().accessLogs.at(-1)).toMatchObject({ action: "sessions_revoked", userId: "usr_lucas" });
  });
});

describe("RN-75 — conta e avisos", () => {
  it("troca de senha: nova igual à atual é recusada; troca válida avisa por e-mail transacional", async () => {
    as("usr_lucas");
    await expect(usersApi.changePassword("draw123", "draw123")).rejects.toMatchObject({ status: 422 });
    await usersApi.changePassword("draw123", "novasenha99");
    const mail = loadDb().emailLogs.at(-1)!;
    expect(mail).toMatchObject({ template: "senha_alterada", to: ["lucas@draw.com.br"] });
  });

  it("mudança de perfil avisa a pessoa e derruba a sessão dela", async () => {
    as("usr_lucas");
    const v = window.localStorage.getItem("draw:session:v");
    as("usr_paula");
    await usersApi.update("usr_lucas", { role: "comercial" });
    expect(loadDb().notifications.some((n) => n.userId === "usr_lucas" && n.type === "seguranca" && /Comercial/.test(n.title))).toBe(true);
    as("usr_lucas");
    window.localStorage.setItem("draw:session:v", v ?? "0");
    expect(await authApi.me()).toBeNull();
  });

  it("aceite do convite avisa quem convidou", async () => {
    as("usr_paula");
    const r = await usersApi.invite({ name: "Nova Pessoa", email: "nova@exemplo.com", role: "operacao" });
    as(null);
    await authApi.acceptInvite(r.inviteToken, { name: "Nova Pessoa", password: "senhaforte1" });
    expect(loadDb().notifications.some((n) => n.userId === "usr_paula" && n.type === "seguranca" && /aceitou o convite/.test(n.title))).toBe(true);
  });

  it("recuperar senha de convidado reenvia o convite; de inativo não envia nada", async () => {
    as("usr_paula");
    await usersApi.invite({ name: "Convidada", email: "conv@exemplo.com", role: "operacao" });
    as(null);
    const before = loadDb().emailLogs.length;
    const r = await authApi.requestPasswordReset("conv@exemplo.com");
    expect(loadDb().emailLogs).toHaveLength(before + 1);
    expect(loadDb().emailLogs.at(-1)?.template).toBe("convite");
    expect(r.demoLink).toMatch(/^\/convite\//);
    transaction((db) => (db.users.find((u) => u.id === "usr_lucas")!.status = "inativo"));
    const n = loadDb().emailLogs.length;
    await authApi.requestPasswordReset("lucas@draw.com.br");
    expect(loadDb().emailLogs).toHaveLength(n);
  });
});


describe("RN-76 — auditoria e histórico", () => {
  it("log de acessos filtra por pessoa, ação e período", async () => {
    as("usr_paula");
    await usersApi.update("usr_lucas", { role: "comercial" });
    transaction((db) => db.accessLogs.push({ ...db.accessLogs[0], id: "old", userId: "usr_carlos", action: "login", detail: null, at: new Date(Date.now() - 40 * 86_400_000).toISOString() }));
    const all = await usersApi.accessLogs();
    expect(all.length).toBeGreaterThan(1);
    expect((await usersApi.accessLogs({ action: "role_changed" })).every((l) => l.action === "role_changed")).toBe(true);
    expect((await usersApi.accessLogs({ userId: "usr_carlos" })).every((l) => l.userId === "usr_carlos")).toBe(true);
    expect((await usersApi.accessLogs({ days: 30 })).some((l) => l.id === "old")).toBe(false);
    as("usr_beatriz");
    await expect(usersApi.accessLogs()).rejects.toMatchObject({ status: 403 });
  });

  it("alterar regras da organização registra quem mudou e o antes/depois", async () => {
    as("usr_paula");
    await usersApi.updateOrganization({ freelancerPaymentDay: 10, dueSoonDays: 5, taxRatePct: 7 });
    const org = await usersApi.organization();
    expect(org.lastChange?.by).toBeTruthy();
    expect(org.lastChange?.changes.some((c) => c.label === "Alíquota" && c.to === "7")).toBe(true);
    as("usr_lucas");
    expect((await usersApi.organization()).lastChange).toBeNull();
  });

  it("cofre registra criação, edição com diff de perfis e remoção", async () => {
    as("usr_paula");
    const id = await admApi.saveVaultItem({ title: "Hospedagem", secret: "s3nha", allowedRoles: ["gestao"] });
    await admApi.saveVaultItem({ title: "Hospedagem", allowedRoles: ["financeiro"] }, id);
    await admApi.removeVaultItem(id);
    const logs = (await admExtraApi.vaultLogs(id)).map((l) => l.action).sort();
    expect(logs).toEqual(["criar", "editar", "remover"]);
    const edit = (await admExtraApi.vaultLogs(id)).find((l) => l.action === "editar");
    expect(edit?.detail).toMatch(/passaram a ver: Financeiro.*deixaram de ver: Gestão/);
  });

  it("documentos institucionais emitem evento ao salvar e remover", async () => {
    as("usr_paula");
    const d = await admApi.saveDocument({ title: "Contrato social", category: "contrato_social", validUntil: null });
    await admApi.saveDocument({ title: "Contrato social", category: "contrato_social", validUntil: "2027-01-01" }, d.id);
    await admApi.removeDocument(d.id);
    const types = loadDb().events.filter((e) => e.entityId === d.id).map((e) => e.type);
    expect(types).toEqual(["document.saved", "document.saved", "document.removed"]);
  });

  it("reenviar e-mail só vale para falha/devolução e só para administradores", async () => {
    as("usr_paula");
    const l = transaction((db) => {
      const row = db.emailLogs.find((x) => x.channel === "system")!;
      row.status = "failed";
      return row;
    });
    const n = loadDb().emailLogs.length;
    await mailApi.resend(l.id);
    expect(loadDb().emailLogs).toHaveLength(n + 1);
    const ok = loadDb().emailLogs.find((x) => x.status === "sent")!;
    await expect(mailApi.resend(ok.id)).rejects.toMatchObject({ status: 409 });
    as("usr_beatriz");
    await expect(mailApi.resend(l.id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-77 — Caixa de entrada", () => {
  const mine = (userId: string) => loadDb().notifications.filter((n) => n.userId === userId);

  it("arquivar não é definitivo: visão Arquivadas, desarquivar e arquivar lidas", async () => {
    as("usr_beatriz");
    const [a, b] = mine("usr_beatriz");
    expect(a && b).toBeTruthy();
    await notificationsApi.markRead(a.id, true);
    await notificationsApi.archive(a.id);
    expect((await notificationsApi.list()).some((n) => n.id === a.id)).toBe(false);
    expect((await notificationsApi.list({ archived: true })).map((n) => n.id)).toEqual([a.id]);
    await notificationsApi.unarchive(a.id);
    expect((await notificationsApi.list()).some((n) => n.id === a.id)).toBe(true);
    await expect(notificationsApi.unarchive(a.id)).rejects.toMatchObject({ status: 404 });
    const n = await notificationsApi.archiveRead();
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await notificationsApi.list()).every((x) => !x.readAt)).toBe(true);
    // ninguém arquiva a notificação dos outros
    as("usr_lucas");
    await notificationsApi.archive(a.id);
    expect(loadDb().notifications.find((x) => x.id === a.id)?.deletedAt).toBeTruthy();
  });

  it("notificação de comentário de tarefa traz o taskId e a de NF traz o link do formulário", async () => {
    const { taskId, payId, freelancerUser } = transaction((db) => {
      const t = db.tasks.find((x) => x.projectId && !x.deletedAt)!;
      const p = db.projects.find((x) => x.id === t.projectId)!;
      const pay = db.payables.find((x) => x.freelancerId && x.status === "aguardando_nf" && db.freelancers.find((f) => f.id === x.freelancerId)?.userId)!;
      const fl = db.freelancers.find((f) => f.id === pay.freelancerId)!;
      const cm = { ...db.comments[0], id: "cm_x", taskId: t.id, projectId: p.id };
      db.comments.push(cm);
      const base = { ...db.notifications[0], id: "nt_x", userId: "usr_beatriz", type: "comentario" as const, projectId: p.id, entityType: "comment", entityId: cm.id, readAt: null, deletedAt: null };
      db.notifications.push(base);
      db.notifications.push({ ...base, id: "nt_y", userId: fl.userId!, type: "nf_solicitada", entityType: "payable", entityId: pay.id });
      return { taskId: t.id, payId: pay.id, freelancerUser: fl.userId! };
    });
    as("usr_beatriz");
    expect((await notificationsApi.list()).find((n) => n.id === "nt_x")?.taskId).toBe(taskId);
    as(freelancerUser);
    const nf = (await notificationsApi.list()).find((n) => n.id === "nt_y");
    const link = loadDb().shareLinks.find((l) => l.purpose === "nf_freelancer" && l.targetId === payId);
    expect(nf?.invoiceToken ?? null).toBe(link && !link.revokedAt && (link.maxUses === null || link.useCount < link.maxUses) && Date.parse(link.expiresAt) > Date.now() ? link.token : null);
  });

  it("arquivo enviado por freelancer avisa o responsável do projeto", async () => {
    const { projectId, ownerId, flUser } = transaction((db) => {
      const m = db.projectMembers.find((x) => x.active && x.freelancerId && db.freelancers.find((f) => f.id === x.freelancerId)?.userId)!;
      const p = db.projects.find((x) => x.id === m.projectId)!;
      return { projectId: p.id, ownerId: p.ownerId, flUser: db.freelancers.find((f) => f.id === m.freelancerId)!.userId! };
    });
    as(flUser);
    const before = mine(ownerId).length;
    await filesApi.upload({ projectId, category: "entrega", file: new File(["x"], "arte-final.png", { type: "image/png" }) });
    expect(mine(ownerId).length).toBe(before + 1);
    expect(mine(ownerId).at(-1)).toMatchObject({ type: "projeto", entityType: "file" });
  });
});

describe("RN-78 — sprints do Administrativo", () => {
  it("iniciar sprint com outra ativa conclui a ativa pela mesma rotina (pendências ao backlog + evento)", async () => {
    as("usr_paula");
    const active = loadDb().sprints.find((x) => x.status === "ativa")!;
    const pending = loadDb().tasks.filter((t) => t.sprintId === active.id && t.statusKey !== "concluida" && t.module === "adm");
    const next = await tasksApi.createSprint({ name: "Próxima", startAt: new Date().toISOString(), endAt: new Date(Date.now() + 9e8).toISOString() });
    await tasksApi.setSprintStatus(next.id, "ativa");
    const db = loadDb();
    expect(db.sprints.find((x) => x.id === active.id)?.status).toBe("concluida");
    expect(db.sprints.filter((x) => x.status === "ativa")).toHaveLength(1);
    expect(pending.every((t) => db.tasks.find((x) => x.id === t.id)?.sprintId === null)).toBe(true);
    expect(db.events.some((e) => e.type === "sprint.finished" && e.entityId === active.id)).toBe(true);
  });

  it("concluir mantendo as pendentes deixa as tarefas na sprint", async () => {
    as("usr_paula");
    const active = loadDb().sprints.find((x) => x.status === "ativa")!;
    const pending = loadDb().tasks.filter((t) => t.sprintId === active.id && t.statusKey !== "concluida" && t.module === "adm");
    await admExtraApi.finishSprint(active.id, "keep");
    expect(pending.every((t) => loadDb().tasks.find((x) => x.id === t.id)?.sprintId === active.id)).toBe(true);
  });

  it("editar sprint e excluir planejada (tarefas voltam ao backlog); ativa e concluída não se excluem", async () => {
    as("usr_paula");
    const s = await tasksApi.createSprint({ name: "Rascunho", startAt: "2026-12-01T12:00:00.000Z", endAt: "2026-12-10T12:00:00.000Z" });
    await tasksApi.updateSprint(s.id, { name: "Rascunho 2", startAt: s.startAt, endAt: "2026-12-12T12:00:00.000Z" });
    await expect(tasksApi.updateSprint(s.id, { name: "x", startAt: "2026-12-10T12:00:00.000Z", endAt: "2026-12-01T12:00:00.000Z" })).rejects.toMatchObject({ status: 422 });
    const t = (await tasksApi.list({ module: "adm", sprintId: "backlog" }))[0];
    await tasksApi.update(t.id, { sprintId: s.id });
    expect(await tasksApi.deleteSprint(s.id)).toEqual({ moved: 1 });
    expect(loadDb().tasks.find((x) => x.id === t.id)?.sprintId).toBeNull();
    const active = loadDb().sprints.find((x) => x.status === "ativa")!;
    await expect(tasksApi.deleteSprint(active.id)).rejects.toMatchObject({ status: 409 });
    as("usr_lucas");
    await expect(tasksApi.updateSprint(active.id, { name: "x", startAt: active.startAt, endAt: active.endAt })).rejects.toMatchObject({ status: 403 });
  });
});
