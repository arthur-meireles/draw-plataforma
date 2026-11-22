/** Testes do M6 (cofre) e M1 (convite) contra a "API" local. */
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { admApi, admExtraApi, authApi, usersApi } from "./index";

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  setSessionUserId("usr_paula");
});

describe("RF-M6-03 — cofre", () => {
  it("não devolve segredo na listagem e registra revelação no log", async () => {
    const items = await admApi.vault();
    expect(items.every((i) => !("secret" in i))).toBe(true);
    const secret = await admApi.reveal(items[0].id, "revelar");
    expect(secret.length).toBeGreaterThan(3);
    const logs = await admExtraApi.vaultLogs(items[0].id);
    expect(logs[0].action).toBe("revelar");
  });

  it("não-admin só vê itens permitidos e não acessa o log geral", async () => {
    setSessionUserId("usr_fernanda");
    const items = await admApi.vault();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.allowedRoles.includes("financeiro"))).toBe(true);
    await expect(admExtraApi.vaultLogs()).rejects.toThrow(/administradores/);
  });

  it("freelancer não acessa o cofre", async () => {
    setSessionUserId("usr_julia");
    await expect(admApi.vault()).rejects.toThrow();
  });
});

describe("RF-M1-02 — convite", () => {
  it("convida, aceita com senha e consome o convite", async () => {
    const r = await usersApi.invite({ name: "Nova Pessoa", email: "nova@draw.com.br", role: "operacao" });
    expect(r.inviteToken).toBe(`convite-${r.id}`);
    const inv = await authApi.getInvite(r.inviteToken);
    expect(inv.email).toBe("nova@draw.com.br");
    await expect(authApi.acceptInvite(r.inviteToken, { name: "Nova Pessoa", password: "curta" })).rejects.toThrow();
    await authApi.acceptInvite(r.inviteToken, { name: "Nova Pessoa", password: "senhaforte1" });
    await expect(authApi.getInvite(r.inviteToken)).rejects.toThrow(/inválido/);
  });
});
