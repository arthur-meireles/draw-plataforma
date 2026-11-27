/**
 * Furos altos de Acesso, Administrativo e Plataforma (onda 2): rotina de prazos (RN-34), gestão de usuários
 * (RN-35/36), 2FA com cadastro e obrigatoriedade (RN-37), tarefas ADM pelo responsável (RN-38),
 * dados do próprio freelancer (RN-39) e trilha de segurança (RN-60).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb, transaction } from "../db";
import { setSessionUserId } from "./_core";
import { jobsApi, runDueSweepTx } from "./index";

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
