/**
 * Drive — lixeira e renomear arquivo (RN-79). Arquivo excluído (exclusão lógica) fica 30 dias na lixeira e pode
 * ser restaurado por quem gerencia Arquivos (Arquivos = T); depois disso a rotina de limpeza do back-end o remove
 * de vez. `GET /files/trash`, `POST /files/:id/restore`, `PATCH /files/:id` `{ name }`.
 */
import type { ID } from "../types";
import { nowIso } from "../db";
import { ApiError, emit, read, requireAccess, touch, write } from "./_core";

export const TRASH_DAYS = 30;
const DAY = 86_400_000;

export const driveTrashApi = {
  list: () =>
    read((db, me) => {
      requireAccess(me, "files", "all", "Só quem gerencia arquivos vê a lixeira. Peça a um administrador ou à gestão.");
      const since = Date.now() - TRASH_DAYS * DAY;
      return db.files
        .filter((f) => f.deletedAt && Date.parse(f.deletedAt) >= since)
        .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""))
        .map((f) => ({
          id: f.id,
          name: f.name,
          projectCode: f.projectId ? (db.projects.find((p) => p.id === f.projectId)?.code ?? null) : null,
          deletedAt: f.deletedAt!,
          daysLeft: Math.max(0, Math.ceil((Date.parse(f.deletedAt!) + TRASH_DAYS * DAY - Date.now()) / DAY)),
        }));
    }, 100),

  restore: (id: ID) =>
    write((db, me) => {
      requireAccess(me, "files", "all", "Só quem gerencia arquivos restaura da lixeira. Peça a um administrador ou à gestão.");
      const f = db.files.find((x) => x.id === id && x.deletedAt);
      if (!f || Date.parse(f.deletedAt!) < Date.now() - TRASH_DAYS * DAY) throw new ApiError(404, "Arquivo não está mais na lixeira (a lixeira guarda 30 dias).");
      // a pasta ou o projeto de origem podem ter sido removidos: volta para a raiz do módulo
      if (f.folderId && !db.folders.some((x) => x.id === f.folderId && !x.deletedAt)) f.folderId = null;
      f.deletedAt = null;
      touch(f);
      emit(db, me, { type: "file.restored", entityType: "file", entityId: f.id, project: db.projects.find((p) => p.id === f.projectId), data: { name: f.name } });
      return f.id;
    }),

  /** Renomear arquivo (baixo do mapa): quem gerencia arquivos; o nome é o mesmo para todas as versões. */
  rename: (id: ID, name: string) =>
    write((db, me) => {
      requireAccess(me, "files", "all", "Só quem gerencia arquivos renomeia. Peça a um administrador ou à gestão.");
      const f = db.files.find((x) => x.id === id && !x.deletedAt);
      if (!f) throw new ApiError(404, "Arquivo não encontrado.");
      const next = name.trim();
      if (!next) throw new ApiError(422, "Dê um nome ao arquivo.", { name: "Dê um nome ao arquivo" });
      if (next === f.name) return f.id;
      const before = f.name;
      f.name = next;
      touch(f);
      emit(db, me, { type: "file.renamed", entityType: "file", entityId: f.id, project: db.projects.find((p) => p.id === f.projectId), data: { from: before, to: next, at: nowIso() } });
      return f.id;
    }),
};
