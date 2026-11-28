/** Administrativo — extensões de autorização (cofre) usadas pelas telas do M6. */
import { nowIso } from "../db";
import type { ID, InstitutionalDocument } from "../types";
import { ApiError, emit, read, requireAccessNow, touch, write } from "./_core";
import { access, canWriteAll } from "@/lib/permissions";
import { admApi } from "./admin";
import { filesApi } from "./collab";

export const admExtraApi = {
  /**
   * RF-M6-03 — log de acesso ao cofre. O log global é só do administrador;
   * o log de um item é de quem tem acesso ao item.
   */
  vaultLogs: (id?: ID) =>
    read((db, me) => {
      if (access(me, "vault") === "-") throw new ApiError(403, "Sem acesso ao cofre.");
      if (!id && me.role !== "admin") throw new ApiError(403, "Só administradores veem o log geral do cofre.");
      if (id) {
        const v = db.vaultItems.find((x) => x.id === id && (me.role === "admin" || !x.deletedAt)); // admin ainda vê o histórico de item removido (RN-76)
        if (!v || (me.role !== "admin" && !v.allowedRoles.includes(me.role))) throw new ApiError(404, "Item não encontrado.");
      }
      return db.vaultAccessLogs
        .filter((l) => !id || l.vaultItemId === id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 100)
        .map((l) => ({
          ...l,
          userName: db.users.find((u) => u.id === l.userId)?.name ?? "—",
          itemTitle: db.vaultItems.find((v) => v.id === l.vaultItemId)?.title ?? "—",
        }));
    }, 100),

  /**
   * RF-M6-01 — encerra a sprint. Tarefas não concluídas voltam ao backlog (padrão)
   * ou ficam na sprint encerrada para histórico.
   */
  finishSprint: (id: ID, unfinished: "backlog" | "keep" = "backlog") =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      const s = db.sprints.find((x) => x.id === id && !x.deletedAt);
      if (!s) throw new ApiError(404, "Sprint não encontrada.");
      if (s.status === "concluida") throw new ApiError(409, "Esta sprint já foi concluída.");
      s.status = "concluida";
      touch(s);
      let moved = 0;
      if (unfinished === "backlog") {
        db.tasks
          .filter((t) => t.sprintId === id && t.module === "adm" && !t.deletedAt && t.statusKey !== "concluida")
          .forEach((t) => {
            t.sprintId = null;
            t.updatedAt = nowIso();
            moved++;
          });
      }
      emit(db, me, { type: "sprint.finished", entityType: "sprint", entityId: s.id, data: { name: s.name, movedToBacklog: moved } });
      return { moved };
    }),

  /** RF-M6-02 — salva o documento e, se houver PDF novo, envia (nova versão quando já havia arquivo). */
  saveDocument: async (input: { title: string; category: InstitutionalDocument["category"]; validUntil: string | null }, opts: { id?: ID; file?: File | null; currentFileId?: ID | null } = {}) => {
    requireAccessNow("adm", "all", "Só a administração e a gestão mantêm documentos institucionais."); // antes de enviar o PDF
    let fileId = opts.currentFileId ?? null;
    if (opts.file) {
      const up = await filesApi.upload({ module: "adm", category: "institucional", file: opts.file, fileId: opts.currentFileId ?? undefined, note: `Documento: ${input.title}` });
      fileId = up.fileId;
    }
    return admApi.saveDocument({ ...input, fileId }, opts.id);
  },
};
