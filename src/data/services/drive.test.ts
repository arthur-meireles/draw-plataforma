/** Regras do Drive (estrutura de pastas da Draw): pastas-raiz, nomes únicos, mover arquivos e visão do freelancer. */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { driveApi, filesApi, PROJECTS_ROOT } from "./index";

const as = (userId: string) => setSessionUserId(userId);
const pdf = (name: string) => new File(["x"], name, { type: "application/pdf" });

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as("usr_paula");
});

describe("Drive — pastas", () => {
  it("não renomeia nem exclui pastas-raiz e exige nome único na mesma pasta", async () => {
    await expect(driveApi.renameFolder(PROJECTS_ROOT, "X")).rejects.toThrow(/Pastas-raiz/);
    await expect(driveApi.removeFolder(PROJECTS_ROOT)).rejects.toThrow(/Pastas-raiz/);
    const root = loadDb().folders.find((f) => f.systemKey === "marketing")!;
    const f = await driveApi.createFolder(root.id, "Eventos");
    await expect(driveApi.createFolder(root.id, "eventos")).rejects.toThrow(/Já existe/);
    await driveApi.removeFolder(f.id);
  });

  it("recusa excluir pasta com conteúdo", async () => {
    const root = loadDb().folders.find((f) => f.systemKey === "marketing")!;
    const f = await driveApi.createFolder(root.id, "Campanha");
    await filesApi.upload({ category: "outro", file: pdf("a.pdf"), folderId: f.id });
    await expect(driveApi.removeFolder(f.id)).rejects.toThrow(/Esvazie/);
  });
});

describe("Drive — arquivos", () => {
  it("mesmo nome em pastas diferentes são arquivos diferentes (não viram versão)", async () => {
    const [a, b] = loadDb().folders.filter((f) => f.parentId && !f.systemKey).slice(0, 2);
    const r1 = await filesApi.upload({ category: "outro", file: pdf("igual.pdf"), folderId: a.id });
    const r2 = await filesApi.upload({ category: "outro", file: pdf("igual.pdf"), folderId: b.id });
    expect(r2.fileId).not.toBe(r1.fileId);
    const r3 = await filesApi.upload({ category: "outro", file: pdf("igual.pdf"), folderId: a.id });
    expect(r3.fileId).toBe(r1.fileId);
    expect(r3.version).toBe(2);
  });

  it("move arquivo avulso, mas arquivo de projeto fica no projeto", async () => {
    const dest = loadDb().folders.find((f) => f.parentId && !f.systemKey)!;
    const loose = loadDb().files.find((f) => !f.projectId && !f.deletedAt)!;
    await driveApi.moveFile(loose.id, dest.id);
    expect(loadDb().files.find((f) => f.id === loose.id)!.folderId).toBe(dest.id);
    const inProject = loadDb().files.find((f) => f.projectId && !f.deletedAt)!;
    await expect(driveApi.moveFile(inProject.id, dest.id)).rejects.toThrow(/pasta do projeto/);
  });
});

describe("Drive — freelancer", () => {
  it("abre direto em 01. Projetos, sem pastas reais", async () => {
    as("usr_julia");
    const loc = await driveApi.location(null);
    expect(loc.id).toBe(PROJECTS_ROOT);
    expect(loc.folders.every((f) => f.kind === "cliente")).toBe(true);
    await expect(driveApi.location("fld_vendas")).resolves.toMatchObject({ id: PROJECTS_ROOT });
  });
});
