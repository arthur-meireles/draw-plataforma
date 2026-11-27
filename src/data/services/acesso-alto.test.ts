/**
 * Furos altos de Acesso, Administrativo e Plataforma (onda 2): rotina de prazos (RN-34), gestão de usuários
 * (RN-35/36), 2FA com cadastro e obrigatoriedade (RN-37), tarefas ADM pelo responsável (RN-38),
 * dados do próprio freelancer (RN-39) e trilha de segurança (RN-60).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb, transaction } from "../db";
import { setSessionUserId } from "./_core";
import { authApi, jobsApi, runDueSweepTx, tasksApi, usersApi, usersExtraApi } from "./index";

const as = (userId: string | null) => setSessionUserId(userId);
const DAY = 86_400_000;
const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const notifs = (userId: string, entityId: string) => loadDb().notifications.filter((n) => n.userId === userId && n.entityId === entityId);

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as(null);
});

describe("RN-34 — rotina de prazos", () => {
  it("avisa prazo e atraso da tarefa ao responsável, uma única vez por marco", async () => {
    const { taskId, soonId, userId } = transaction((db) => {
      const p = db.projects.find((x) => x.status === "ativo" && !x.pausedAt)!;
      const [t, s] = db.tasks.filter((x) => x.projectId === p.id && !x.deletedAt).slice(0, 2);
      Object.assign(t, { assigneeUserId: "usr_lucas", assigneeFreelancerId: null, statusKey: "a_fazer", dueAt: iso(-3) });
      Object.assign(s, { assigneeUserId: "usr_lucas", assigneeFreelancerId: null, statusKey: "a_fazer", dueAt: iso(1) });
      return { taskId: t.id, soonId: s.id, userId: "usr_lucas" };
    });
    as("usr_carlos");
    await jobsApi.runDueSweep();
    expect(notifs(userId, taskId).filter((n) => n.type === "atraso")).toHaveLength(1);
    expect(notifs(userId, soonId).filter((n) => n.type === "prazo")).toHaveLength(1);
    const r = await jobsApi.runDueSweep();
    expect(notifs(userId, taskId)).toHaveLength(1);
    expect(notifs(userId, soonId)).toHaveLength(1);
    expect(r.created).toBe(0);
  });

  it("tarefa concluída, sem prazo ou de projeto parado não gera aviso", () => {
    const ids = transaction((db) => {
      const p = db.projects.find((x) => x.status === "ativo")!;
      p.pausedAt = new Date().toISOString();
      const t = db.tasks.find((x) => x.projectId === p.id && !x.deletedAt)!;
      Object.assign(t, { assigneeUserId: "usr_lucas", statusKey: "a_fazer", dueAt: iso(-2) });
      const done = db.tasks.find((x) => x.projectId !== p.id && x.module === "projeto" && !x.deletedAt)!;
      Object.assign(done, { assigneeUserId: "usr_lucas", statusKey: "concluida", dueAt: iso(-2) });
      return [t.id, done.id];
    });
    transaction((db) => runDueSweepTx(db));
    ids.forEach((id) => expect(notifs("usr_lucas", id)).toHaveLength(0));
  });

  it("documento institucional: D-30, D-7 e vencido para quem gerencia o Administrativo", () => {
    const docId = transaction((db) => {
      const d = db.institutionalDocuments.find((x) => !x.deletedAt)!;
      db.institutionalDocuments.filter((x) => x.id !== d.id).forEach((x) => (x.validUntil = null));
      d.validUntil = iso(20);
      return d.id;
    });
    transaction((db) => runDueSweepTx(db));
    transaction((db) => runDueSweepTx(db, new Date(Date.now() + 15 * DAY)));
    transaction((db) => runDueSweepTx(db, new Date(Date.now() + 25 * DAY)));
    transaction((db) => runDueSweepTx(db, new Date(Date.now() + 26 * DAY)));
    const admin = notifs("usr_paula", docId);
    expect(admin.map((n) => n.type)).toEqual(["prazo", "prazo", "atraso"]);
    expect(notifs("usr_beatriz", docId)).toHaveLength(3);
    expect(notifs("usr_fernanda", docId)).toHaveLength(0); // Financeiro só lê o Administrativo
  });

  it("recebível vencido avisa o Financeiro e o responsável do projeto (se vê contas a receber)", () => {
    const { recId, ownerId } = transaction((db) => {
      const r = db.receivables.find((x) => !x.deletedAt && x.status === "previsto")!;
      r.expectedAt = iso(-5);
      const p = db.projects.find((x) => x.id === r.projectId)!;
      p.ownerId = "usr_carlos";
      return { recId: r.id, ownerId: p.ownerId };
    });
    transaction((db) => runDueSweepTx(db));
    expect(notifs("usr_fernanda", recId)).toHaveLength(1);
    expect(notifs(ownerId, recId)).toHaveLength(1);
    expect(notifs("usr_lucas", recId)).toHaveLength(0);
  });

  it("respeita a preferência da pessoa e exige sessão", async () => {
    await expect(jobsApi.runDueSweep()).rejects.toMatchObject({ status: 401 });
    const taskId = transaction((db) => {
      db.notificationPreferences.filter((p) => p.userId === "usr_lucas" && p.type === "atraso").forEach((p) => (p.enabled = false));
      const t = db.tasks.find((x) => x.module === "adm" && !x.deletedAt)!;
      Object.assign(t, { assigneeUserId: "usr_lucas", statusKey: "a_fazer", dueAt: iso(-1) });
      return t.id;
    });
    transaction((db) => runDueSweepTx(db));
    expect(notifs("usr_lucas", taskId)).toHaveLength(0);
  });
});

describe("RN-38 — responsável muda o status da própria tarefa ADM", () => {
  const admTask = (assignee: string) =>
    transaction((db) => {
      const t = db.tasks.find((x) => x.module === "adm" && !x.deletedAt)!;
      Object.assign(t, { assigneeUserId: assignee, assigneeFreelancerId: null, statusKey: "a_fazer" });
      return t.id;
    });

  it("Operação conclui a tarefa ADM atribuída a ela, mas não muda outros campos", async () => {
    const id = admTask("usr_lucas");
    as("usr_lucas");
    const view = await tasksApi.get(id);
    expect(view.canEdit).toBe(false);
    expect(view.canChangeStatus).toBe(true);
    await tasksApi.update(id, { statusKey: "concluida" });
    expect(loadDb().tasks.find((t) => t.id === id)?.statusKey).toBe("concluida");
    await expect(tasksApi.update(id, { dueAt: iso(3) })).rejects.toMatchObject({ status: 403 });
    await expect(tasksApi.update(id, { statusKey: "a_fazer", title: "x" })).rejects.toMatchObject({ status: 403 });
  });

  it("quem não é o responsável continua só consultando", async () => {
    const id = admTask("usr_carlos");
    as("usr_lucas");
    expect((await tasksApi.get(id)).canChangeStatus).toBe(false);
    await expect(tasksApi.update(id, { statusKey: "concluida" })).rejects.toMatchObject({ status: 403 });
  });
});

const tokenOf = (r: { inviteToken: string }) => r.inviteToken;
const logs = (action: string) => loadDb().accessLogs.filter((l) => l.action === action);

describe("RN-35 — convites e perfil coerentes", () => {
  it("cancelar convite revoga o link, tira a pessoa da lista e libera o e-mail", async () => {
    as("usr_paula");
    const r = await usersApi.invite({ name: "Pessoa Nova", email: "nova@draw.com.br", role: "operacao" });
    await usersExtraApi.cancelInvite(r.id);
    await expect(authApi.getInvite(tokenOf(r))).rejects.toMatchObject({ status: 404 });
    expect((await usersApi.list()).some((u) => u.id === r.id)).toBe(false);
    expect(logs("invite_cancelled")).toHaveLength(1);
    await expect(usersExtraApi.cancelInvite("usr_lucas")).rejects.toMatchObject({ status: 409 });
    const again = await usersApi.invite({ name: "Pessoa Nova", email: "nova@draw.com.br", role: "operacao" });
    expect(again.id).not.toBe(r.id);
  });

  it("só admin cancela convite", async () => {
    as("usr_paula");
    const r = await usersApi.invite({ name: "X", email: "x@draw.com.br", role: "operacao" });
    as("usr_beatriz");
    await expect(usersExtraApi.cancelInvite(r.id)).rejects.toMatchObject({ status: 403 });
  });

  it("convite com perfil Freelancer cria o cadastro de freelancer ligado (ou aproveita o do mesmo e-mail)", async () => {
    as("usr_paula");
    const r = await usersApi.invite({ name: "Rafa Freela", email: "rafa@gmail.com", role: "freelancer" });
    const fl = loadDb().freelancers.find((f) => f.userId === r.id);
    expect(fl).toMatchObject({ email: "rafa@gmail.com", status: "ativo" });
    expect(loadDb().users.find((u) => u.id === r.id)?.userType).toBe("freelancer");
    const existing = transaction((db) => db.freelancers.find((f) => !f.userId && !f.deletedAt)!);
    const r2 = await usersApi.invite({ name: existing.name, email: existing.email, role: "freelancer" });
    expect(loadDb().freelancers.find((f) => f.id === existing.id)?.userId).toBe(r2.id);
  });

  it("mudar o perfil ajusta o tipo do usuário e o cadastro de freelancer", async () => {
    as("usr_paula");
    await usersApi.update("usr_lucas", { role: "freelancer" });
    let db = loadDb();
    expect(db.users.find((u) => u.id === "usr_lucas")?.userType).toBe("freelancer");
    const fl = db.freelancers.find((f) => f.userId === "usr_lucas")!;
    expect(fl.status).toBe("ativo");
    await usersApi.update("usr_lucas", { role: "operacao" });
    db = loadDb();
    expect(db.users.find((u) => u.id === "usr_lucas")?.userType).toBe("internal");
    expect(db.freelancers.find((f) => f.id === fl.id)?.status).toBe("inativo");
    expect(logs("role_changed")).toHaveLength(2);
  });
});

describe("RN-36 — inativar com reatribuição", () => {
  it("responsável por projetos exige quem assume; projetos e tarefas passam para ele, que é avisado", async () => {
    const owned = transaction((db) => db.projects.filter((p) => p.ownerId === "usr_lucas" && !p.deletedAt && (p.status === "ativo" || p.status === "cotacao")).length);
    as("usr_paula");
    const impact = await usersExtraApi.deactivationImpact("usr_lucas");
    expect(impact.projects).toHaveLength(owned);
    if (owned) await expect(usersExtraApi.deactivate("usr_lucas")).rejects.toMatchObject({ status: 422 });
    const r = await usersExtraApi.deactivate("usr_lucas", { reassignTo: "usr_beatriz" });
    const db = loadDb();
    expect(db.users.find((u) => u.id === "usr_lucas")?.status).toBe("inativo");
    expect(db.projects.filter((p) => p.ownerId === "usr_lucas" && !p.deletedAt && (p.status === "ativo" || p.status === "cotacao"))).toHaveLength(0);
    expect(db.tasks.filter((t) => t.assigneeUserId === "usr_lucas" && t.statusKey !== "concluida" && !t.deletedAt)).toHaveLength(0);
    expect(r.tasks).toBe(impact.tasks.length);
    if (owned || r.tasks) expect(db.notifications.some((n) => n.userId === "usr_beatriz" && n.type === "atribuicao")).toBe(true);
    expect(logs("user_deactivated")).toHaveLength(1);
  });

  it("inativar usuário freelancer inativa o cadastro; reativar devolve", async () => {
    as("usr_paula");
    const flUser = loadDb().users.find((u) => u.role === "freelancer" && u.status === "ativo")!;
    await usersExtraApi.deactivate(flUser.id);
    expect(loadDb().freelancers.find((f) => f.userId === flUser.id)?.status).toBe("inativo");
    await usersExtraApi.reactivate(flUser.id);
    expect(loadDb().freelancers.find((f) => f.userId === flUser.id)?.status).toBe("ativo");
  });

  it("a sessão de quem foi inativado cai na hora", async () => {
    as("usr_carlos");
    expect((await authApi.me())?.id).toBe("usr_carlos");
    transaction((db) => {
      db.projects.filter((p) => p.ownerId === "usr_carlos").forEach((p) => (p.ownerId = "usr_paula"));
    });
    as("usr_paula");
    await usersExtraApi.deactivate("usr_carlos");
    as("usr_carlos");
    expect(await authApi.me()).toBeNull();
  });
});

describe("RN-60 — trilha de segurança", () => {
  it("troca de senha e convite vão para o log de acessos", async () => {
    as("usr_carlos");
    await usersApi.changePassword("draw123", "novaSenha123");
    expect(logs("password_changed")).toHaveLength(1);
    expect((await authApi.me())?.id).toBe("usr_carlos"); // a própria sessão continua
    as("usr_paula");
    await usersApi.invite({ name: "Log", email: "log@draw.com.br", role: "comercial" });
    expect(logs("invite_sent")).toHaveLength(1);
  });
});
