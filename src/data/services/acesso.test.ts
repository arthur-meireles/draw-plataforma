/**
 * Acesso e segurança (RF-M1-01/02, RN-30…RN-33): 2FA antes da sessão, recuperação de senha real,
 * convites com token aleatório e troca de perfil só no modo de demonstração.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDb, resetDb } from "../db";
import { getSessionUserId, setSessionUserId } from "./_core";
import { authApi, projectsApi, usersApi, usersExtraApi } from "./index";

const as = (userId: string | null) => setSessionUserId(userId);
const lastLog = () => loadDb().accessLogs.at(-1)!;

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RN-30 — sessão só depois do 2FA", () => {
  it("login de quem tem 2FA devolve desafio e não cria sessão", async () => {
    const r = await authApi.login("paula@draw.com.br", "draw123");
    expect(r.mfaRequired).toBe(true);
    expect(getSessionUserId()).toBeNull();
    expect(await authApi.me()).toBeNull();
    await expect(projectsApi.list()).rejects.toMatchObject({ status: 401 });
  });

  it("só o código confirmado cria a sessão (demonstração: qualquer 6 dígitos)", async () => {
    const r = await authApi.login("paula@draw.com.br", "draw123");
    if (!r.mfaRequired) throw new Error("esperava 2FA");
    await expect(authApi.verifyMfa(r.mfaChallenge, "12a")).rejects.toMatchObject({ status: 422 });
    expect(await authApi.me()).toBeNull();
    expect(lastLog().action).toBe("mfa_failed");
    await authApi.verifyMfa(r.mfaChallenge, "123456");
    expect((await authApi.me())?.id).toBe("usr_paula");
    expect(lastLog()).toMatchObject({ action: "login", userId: "usr_paula" });
  });

  it("desafio não é reutilizável, nem vale depois de cancelado, nem inventado", async () => {
    const r = await authApi.login("paula@draw.com.br", "draw123");
    if (!r.mfaRequired) throw new Error("esperava 2FA");
    await authApi.cancelMfa(r.mfaChallenge);
    await expect(authApi.verifyMfa(r.mfaChallenge, "123456")).rejects.toMatchObject({ status: 401 });
    await expect(authApi.verifyMfa("usr_paula", "123456")).rejects.toMatchObject({ status: 401 });
    expect(await authApi.me()).toBeNull();
  });

  it("sem 2FA entra direto", async () => {
    const r = await authApi.login("carlos@draw.com.br", "draw123");
    expect(r.mfaRequired).toBe(false);
    expect((await authApi.me())?.id).toBe("usr_carlos");
  });
});

describe("RN-31 — recuperação de senha", () => {
  const tokenOf = (link: string | null) => new URL(link!, "http://x").searchParams.get("token")!;

  it("cria token de 1 h guardado só como hash, troca a senha e consome o token", async () => {
    const { demoLink } = await authApi.requestPasswordReset("carlos@draw.com.br");
    const token = tokenOf(demoLink);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const row = loadDb().passwordResets.at(-1)!;
    expect(row.userId).toBe("usr_carlos");
    expect(row.tokenHash).not.toBe(token);
    expect(new Date(row.expiresAt).getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(loadDb().emailLogs.at(-1)).toMatchObject({ template: "recuperar_senha", to: ["carlos@draw.com.br"] });

    await authApi.resetPassword(token, "novaSenha1");
    await expect(authApi.login("carlos@draw.com.br", "draw123")).rejects.toMatchObject({ status: 401 });
    expect((await authApi.login("carlos@draw.com.br", "novaSenha1")).mfaRequired).toBe(false);
    await expect(authApi.resetPassword(token, "outraSenha1")).rejects.toThrow(/já foi usado/);
    expect(loadDb().accessLogs.some((l) => l.action === "password_reset_done" && l.userId === "usr_carlos")).toBe(true);
  });

  it("derruba as sessões abertas do usuário", async () => {
    const { demoLink } = await authApi.requestPasswordReset("carlos@draw.com.br");
    as("usr_carlos");
    await projectsApi.list();
    await authApi.resetPassword(tokenOf(demoLink), "novaSenha1");
    as(null);
    window.localStorage.setItem("draw:session", "usr_carlos"); // sessão antiga (versão 0) continua no navegador
    window.localStorage.setItem("draw:session:v", "0");
    await expect(projectsApi.list()).rejects.toMatchObject({ status: 401 });
  });

  it("token expirado, inexistente ou vazio é recusado com mensagem clara", async () => {
    const { demoLink } = await authApi.requestPasswordReset("carlos@draw.com.br");
    loadDb().passwordResets.at(-1)!.expiresAt = new Date(Date.now() - 1000).toISOString();
    await expect(authApi.resetPassword(tokenOf(demoLink), "novaSenha1")).rejects.toThrow(/expirou/);
    await expect(authApi.resetPassword("demonstracao", "novaSenha1")).rejects.toMatchObject({ status: 409 });
    await expect(authApi.resetPassword("", "novaSenha1")).rejects.toMatchObject({ status: 409 });
  });

  it("pedido novo invalida o link anterior", async () => {
    const a = tokenOf((await authApi.requestPasswordReset("carlos@draw.com.br")).demoLink);
    await authApi.requestPasswordReset("carlos@draw.com.br");
    await expect(authApi.resetPassword(a, "novaSenha1")).rejects.toMatchObject({ status: 409 });
  });

  it("desconhecido e inativo recebem a mesma resposta, sem token nem e-mail; convidado recebe o convite de novo (RN-75)", async () => {
    as("usr_paula");
    await usersExtraApi.deactivate("usr_marina", { reassignTo: "usr_beatriz" }); // RN-36: projetos dela passam a outra pessoa
    as(null);
    const emails = loadDb().emailLogs.length;
    for (const email of ["ninguem@draw.com.br", "marina@draw.com.br"]) {
      expect(await authApi.requestPasswordReset(email)).toEqual({ demoLink: null });
    }
    expect(loadDb().passwordResets).toHaveLength(0);
    expect(loadDb().emailLogs.length).toBe(emails);
    // convidado: não há senha a recuperar — o convite é reenviado (link novo), nunca um token de recuperação
    await authApi.requestPasswordReset("thiago@draw.com.br");
    expect(loadDb().passwordResets).toHaveLength(0);
    expect(loadDb().emailLogs.length).toBe(emails + 1);
    expect(loadDb().emailLogs.at(-1)?.template).toBe("convite");
  });

  it("fora do modo de demonstração o link nunca volta na resposta", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOGIN", "");
    expect(await authApi.requestPasswordReset("carlos@draw.com.br")).toEqual({ demoLink: null });
    expect(loadDb().passwordResets).toHaveLength(1);
  });
});

describe("RN-32 — convites", () => {
  beforeEach(() => as("usr_paula"));

  it("token aleatório, guardado como hash, uso único", async () => {
    const r = await usersApi.invite({ name: "Nova", email: "nova@draw.com.br", role: "operacao" });
    expect(r.inviteToken).not.toContain(r.id);
    expect(loadDb().userInvites.at(-1)!.tokenHash).not.toBe(r.inviteToken);
    await expect(authApi.getInvite(r.id)).rejects.toMatchObject({ status: 404 });
    await expect(authApi.getInvite(`convite-${r.id}`)).rejects.toMatchObject({ status: 404 });
    await authApi.acceptInvite(r.inviteToken, { name: "Nova", password: "senhaforte1" });
    await expect(authApi.acceptInvite(r.inviteToken, { name: "Outra", password: "senhaforte1" })).rejects.toMatchObject({ status: 404 });
    expect(lastLog()).toMatchObject({ action: "invite_accepted", userId: r.id });
  });

  it("expira em 7 dias", async () => {
    const r = await usersApi.invite({ name: "Nova", email: "nova@draw.com.br", role: "operacao" });
    const inv = loadDb().userInvites.at(-1)!;
    expect(Math.round((new Date(inv.expiresAt).getTime() - Date.now()) / 86_400_000)).toBe(7);
    inv.expiresAt = new Date(Date.now() - 1000).toISOString();
    await expect(authApi.getInvite(r.inviteToken)).rejects.toThrow(/expirou/);
  });

  it("reenviar e copiar o link geram token novo e revogam o anterior", async () => {
    const a = await usersApi.invite({ name: "Nova", email: "nova@draw.com.br", role: "operacao" });
    const emails = loadDb().emailLogs.length;
    const b = await usersApi.inviteLink(a.id);
    expect(loadDb().emailLogs.length).toBe(emails); // copiar não envia e-mail
    await expect(authApi.getInvite(a.inviteToken)).rejects.toMatchObject({ status: 404 });
    await usersApi.resendInvite(a.id);
    expect(loadDb().emailLogs.length).toBe(emails + 1);
    await expect(authApi.getInvite(b.inviteToken)).rejects.toMatchObject({ status: 404 });
  });

  it("listagem nunca devolve token; link do convite é só do administrador", async () => {
    const rows = await usersApi.list();
    expect(rows.every((u) => !("inviteToken" in u) && !("passwordMock" in u))).toBe(true);
    as("usr_beatriz");
    await expect(usersApi.inviteLink("usr_convite")).rejects.toMatchObject({ status: 403 });
    as("usr_julia");
    await expect(usersApi.list()).rejects.toMatchObject({ status: 403 });
  });

  it("convite de freelancer pelo cadastro usa o mesmo token e envia e-mail", async () => {
    const { freelancersApi } = await import("./index");
    const fl = loadDb().freelancers.find((f) => !f.userId && !f.deletedAt)!;
    const r = await freelancersApi.invite(fl.id);
    expect(r.inviteToken).toMatch(/^[0-9a-f]{64}$/);
    expect(loadDb().emailLogs.at(-1)).toMatchObject({ template: "convite", to: [fl.email] });
    expect((await authApi.getInvite(r.inviteToken)).role).toBe("freelancer");
  });
});

describe("RN-33 — troca de perfil e restauração só na demonstração", () => {
  it("demo ligada: troca registrada no log de acessos (quem → qual perfil)", async () => {
    as("usr_julia");
    const profiles = await authApi.demoProfiles();
    expect(profiles.some((p) => p.id === "usr_paula")).toBe(true);
    await authApi.impersonate("usr_paula");
    expect(getSessionUserId()).toBe("usr_paula");
    expect(lastLog()).toMatchObject({ action: "impersonate", userId: "usr_julia" });
    expect(lastLog().detail).toMatch(/Júlia Martins → Paula Andrade \(Administrador/);
  });

  it("demo desligada: serviço recusa trocar de perfil e restaurar dados", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOGIN", "");
    as("usr_paula");
    await expect(authApi.impersonate("usr_carlos")).rejects.toMatchObject({ status: 403 });
    await expect(authApi.demoProfiles()).rejects.toMatchObject({ status: 403 });
    await expect(authApi.resetDemo()).rejects.toMatchObject({ status: 403 });
    expect(getSessionUserId()).toBe("usr_paula");
  });

  it("NEXT_PUBLIC_DEMO_LOGIN=1 liga a demonstração mesmo em produção", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOGIN", "1");
    as("usr_paula");
    await authApi.impersonate("usr_carlos");
    expect(getSessionUserId()).toBe("usr_carlos");
  });

  it("restaurar dados: só administrador; fica registrado", async () => {
    as("usr_carlos");
    await expect(authApi.resetDemo()).rejects.toMatchObject({ status: 403 });
    as("usr_paula");
    await authApi.resetDemo();
    expect(lastLog()).toMatchObject({ action: "demo_reset", userId: "usr_paula" });
    expect(getSessionUserId()).toBe("usr_paula");
  });
});
