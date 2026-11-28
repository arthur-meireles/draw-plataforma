/**
 * Furos médios de Acesso, Administrativo e Plataforma (onda 3): bloqueio de login persistente (RN-75),
 * sessão por inatividade e encerrar outras sessões (RN-75), avisos de segurança (RN-75).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDb, resetDb, transaction } from "../db";
import { SESSION_IDLE_MS, setSessionUserId } from "./_core";
import { authApi, usersApi } from "./index";

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

