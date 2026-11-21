/** Arquivos (M7), comentários, aprovações, histórico (RF-X-02) e notificações (M10). */
import { baseFields, nowIso } from "../db";
import type { Approval, ApprovalDecision, FileCategory, FileEntity, ID, NotificationType } from "../types";
import { ApiError, assertProjectVisible, emit, notify, read, touch, visibleProjects, write } from "./_core";
import { canSeeMoney, canWriteAll } from "@/lib/permissions";

const MAX_FILE_BYTES = 200 * 1024 * 1024; // [A VALIDAR] limite por arquivo
const DATAURL_LIMIT = 1.5 * 1024 * 1024; // guarda conteúdo só de arquivos pequenos no mock

async function sha256Of(buf: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function toDataUrl(file: File): Promise<string | null> {
  if (file.size > DATAURL_LIMIT) return null;
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => res(null);
    r.readAsDataURL(file);
  });
}

export interface FileFilters {
  projectId?: ID;
  clientId?: ID;
  module?: FileEntity["module"];
  category?: FileCategory;
  q?: string;
}

export const filesApi = {
  list: (f: FileFilters = {}) =>
    read((db, me) => {
      const visible = new Set(visibleProjects(db, me).map((p) => p.id));
      const q = f.q?.trim().toLowerCase();
      const money = canSeeMoney(me);
      return db.files
        .filter((x) => !x.deletedAt)
        .filter((x) => (x.projectId ? visible.has(x.projectId) : x.module === "adm" ? me.role !== "freelancer" : true))
        .filter((x) => me.role !== "freelancer" || x.releasedToFreelancers || db.fileVersions.some((v) => v.fileId === x.id && v.uploadedBy === me.id))
        .filter((x) => money || !["proposta", "nf"].includes(x.category))
        .filter((x) => !f.projectId || x.projectId === f.projectId)
        .filter((x) => !f.clientId || x.clientId === f.clientId)
        .filter((x) => !f.module || x.module === f.module)
        .filter((x) => !f.category || x.category === f.category)
        .filter((x) => !q || x.name.toLowerCase().includes(q))
        .map((x) => {
          const versions = db.fileVersions.filter((v) => v.fileId === x.id && !v.deletedAt).sort((a, b) => b.version - a.version);
          const current = versions.find((v) => v.id === x.currentVersionId) ?? versions[0];
          const uploader = db.users.find((u) => u.id === current?.uploadedBy);
          const p = x.projectId ? db.projects.find((pp) => pp.id === x.projectId) : null;
          return {
            ...x,
            current,
            versions: versions.map((v) => ({ ...v, dataUrl: null, uploaderName: db.users.find((u) => u.id === v.uploadedBy)?.name ?? "Formulário público" })),
            uploaderName: uploader?.name ?? "Formulário público",
            projectCode: p?.code ?? null,
            clientName: x.clientId ? db.clients.find((c) => c.id === x.clientId)?.tradeName ?? null : null,
          };
        })
        .sort((a, b) => (b.current?.createdAt ?? "").localeCompare(a.current?.createdAt ?? ""));
    }),

  /** Upload em duas etapas no contrato real; aqui, uma chamada. RF-M7-01/02. */
  upload: async (input: { projectId?: ID | null; clientId?: ID | null; module?: FileEntity["module"]; taskId?: ID | null; category: FileCategory; file: File; fileId?: ID; note?: string; releasedToFreelancers?: boolean }) => {
    if (input.file.size > MAX_FILE_BYTES) throw new ApiError(422, `"${input.file.name}" passa do limite de 200 MB.`);
    const [hash, dataUrl] = await Promise.all([sha256Of(await input.file.arrayBuffer()), toDataUrl(input.file)]);
    return write((db, me) => {
      const p = input.projectId ? assertProjectVisible(db, me, input.projectId) : null;
      if (me.role === "freelancer" && !p) throw new ApiError(403, "Sem permissão.");
      let file = input.fileId ? db.files.find((x) => x.id === input.fileId) : db.files.find((x) => !x.deletedAt && x.projectId === (p?.id ?? null) && x.name === input.file.name && x.module === (input.module ?? (p ? "projeto" : "adm")));
      const version = file ? Math.max(...db.fileVersions.filter((v) => v.fileId === file!.id).map((v) => v.version)) + 1 : 1;
      const fileId = file?.id ?? `file_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const v = { ...baseFields(me.id), fileId, version, storageKey: `org_draw/${p?.id ?? "adm"}/${fileId}/v${version}`, size: input.file.size, mime: input.file.type || "application/octet-stream", sha256: hash, uploadedBy: me.id, note: input.note ?? null, dataUrl };
      db.fileVersions.push(v);
      if (file) {
        file.currentVersionId = v.id;
        touch(file);
      } else {
        file = { ...baseFields(me.id), id: fileId, projectId: p?.id ?? null, clientId: p?.clientId ?? input.clientId ?? null, module: input.module ?? (p ? "projeto" : "adm"), taskId: input.taskId ?? null, category: input.category, name: input.file.name, currentVersionId: v.id, releasedToFreelancers: input.releasedToFreelancers ?? me.role === "freelancer" };
        db.files.push(file);
      }
      emit(db, me, { type: version > 1 ? "file.version_added" : "file.uploaded", entityType: "file", entityId: fileId, project: p, data: { name: input.file.name, version, sha256: hash } });
      return { fileId, versionId: v.id, version };
    }, 300);
  },

  setReleased: (fileId: ID, released: boolean) =>
    write((db, me) => {
      const f = db.files.find((x) => x.id === fileId);
      if (!f) throw new ApiError(404, "Arquivo não encontrado.");
      if (!canWriteAll(me, "files")) throw new ApiError(403, "Sem permissão.");
      f.releasedToFreelancers = released;
      touch(f);
      emit(db, me, { type: released ? "file.released" : "file.unreleased", entityType: "file", entityId: f.id, project: db.projects.find((p) => p.id === f.projectId), data: { name: f.name } });
    }),

  setCategory: (fileId: ID, category: FileCategory) =>
    write((db) => {
      const f = db.files.find((x) => x.id === fileId);
      if (!f) throw new ApiError(404, "Arquivo não encontrado.");
      f.category = category;
      touch(f);
    }),

  restoreVersion: (fileId: ID, versionId: ID) =>
    write((db, me) => {
      const f = db.files.find((x) => x.id === fileId);
      if (!f) throw new ApiError(404, "Arquivo não encontrado.");
      f.currentVersionId = versionId;
      touch(f);
      emit(db, me, { type: "file.version_restored", entityType: "file", entityId: f.id, project: db.projects.find((p) => p.id === f.projectId), data: { name: f.name } });
    }),

  remove: (fileId: ID) =>
    write((db, me) => {
      const f = db.files.find((x) => x.id === fileId);
      if (!f) throw new ApiError(404, "Arquivo não encontrado.");
      if (!canWriteAll(me, "files")) throw new ApiError(403, "Sem permissão.");
      f.deletedAt = nowIso();
      emit(db, me, { type: "file.deleted", entityType: "file", entityId: f.id, project: db.projects.find((p) => p.id === f.projectId), data: { name: f.name } });
    }),

  /** RF-M7-04 — link assinado de curta duração (mock: data URL ou blob placeholder). */
  downloadUrl: (versionId: ID) =>
    read((db) => {
      const v = db.fileVersions.find((x) => x.id === versionId);
      if (!v) throw new ApiError(404, "Versão não encontrada.");
      const f = db.files.find((x) => x.id === v.fileId)!;
      return { name: f.name, url: v.dataUrl, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    }, 60),
};

export const commentsApi = {
  list: (projectId: ID, taskId?: ID | null) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      return db.comments
        .filter((c) => c.projectId === p.id && !c.deletedAt && (taskId === undefined || c.taskId === taskId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((c) => {
          const u = db.users.find((x) => x.id === c.authorId);
          return { ...c, authorName: u?.name ?? "—", authorColor: u?.avatarColor ?? "#888", taskTitle: c.taskId ? db.tasks.find((t) => t.id === c.taskId)?.title ?? null : null };
        });
    }),

  create: (input: { projectId: ID; taskId?: ID | null; body: string; mentions: ID[] }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, input.projectId);
      if (!input.body.trim()) throw new ApiError(422, "Escreva um comentário.", { body: "Escreva um comentário" });
      const c = { ...baseFields(me.id), projectId: p.id, taskId: input.taskId ?? null, authorId: me.id, body: input.body.trim(), mentions: input.mentions };
      db.comments.push(c);
      emit(db, me, { type: "comment.created", entityType: "comment", entityId: c.id, project: p, data: { taskId: c.taskId, excerpt: c.body.slice(0, 80) } });
      input.mentions.forEach((uid) => notify(db, me, { userId: uid, type: "mencao", title: `${me.name} mencionou você`, body: `"${c.body.slice(0, 80)}"`, project: p, entityType: "comment", entityId: c.id }));
      return c;
    }),

  update: (id: ID, body: string) =>
    write((db, me) => {
      const c = db.comments.find((x) => x.id === id);
      if (!c || c.authorId !== me.id) throw new ApiError(403, "Você só pode editar seus comentários.");
      c.body = body.trim();
      touch(c);
    }),

  remove: (id: ID) =>
    write((db, me) => {
      const c = db.comments.find((x) => x.id === id);
      if (!c) throw new ApiError(404, "Comentário não encontrado.");
      if (c.authorId !== me.id && me.role !== "admin") throw new ApiError(403, "Você só pode excluir seus comentários.");
      c.deletedAt = nowIso();
    }),
};

export const approvalsApi = {
  list: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      return db.approvals
        .filter((a) => a.projectId === p.id && !a.deletedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => ({ ...a, decidedByName: db.users.find((u) => u.id === a.decidedBy)?.name ?? null }));
    }),

  request: (projectId: ID, input: { stageKey: Approval["stageKey"]; requestedFrom: string }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      if (!input.requestedFrom.trim()) throw new ApiError(422, "Informe de quem é a aprovação.", { requestedFrom: "Informe de quem é a aprovação" });
      const a: Approval = { ...baseFields(me.id), projectId: p.id, stageKey: input.stageKey, requestedFrom: input.requestedFrom.trim(), decision: "pendente", reason: null, decidedBy: null, decidedAt: null };
      db.approvals.push(a);
      emit(db, me, { type: "approval.requested", entityType: "approval", entityId: a.id, project: p, data: { stageKey: a.stageKey, requestedFrom: a.requestedFrom } });
      return a;
    }),

  /** RF-M4-10 — "ajustes" e "negado" exigem motivo [A VALIDAR]. */
  decide: (id: ID, decision: Exclude<ApprovalDecision, "pendente">, reason?: string) =>
    write((db, me) => {
      const a = db.approvals.find((x) => x.id === id);
      if (!a) throw new ApiError(404, "Aprovação não encontrada.");
      const p = assertProjectVisible(db, me, a.projectId);
      if (me.role === "freelancer") throw new ApiError(403, "Sem permissão.");
      if (decision !== "aprovado" && !reason?.trim()) throw new ApiError(422, "Explique o motivo.", { reason: "Explique o que precisa mudar" });
      a.decision = decision;
      a.reason = reason?.trim() || null;
      a.decidedBy = me.id;
      a.decidedAt = nowIso();
      touch(a);
      emit(db, me, { type: "approval.decided", entityType: "approval", entityId: a.id, project: p, data: { stageKey: a.stageKey, decision, reason: a.reason } });
      db.projectMembers.filter((m) => m.projectId === p.id && m.active && m.userId).forEach((m) => notify(db, me, { userId: m.userId, type: "aprovacao", title: `Aprovação: ${decision === "aprovado" ? "aprovado" : decision === "ajustes" ? "ajustes pedidos" : "negado"}`, project: p }));
      return a;
    }),
};

export const eventsApi = {
  list: (f: { projectId?: ID; entityType?: string; entityId?: ID; clientId?: ID; limit?: number } = {}) =>
    read((db, me) => {
      const visible = new Set(visibleProjects(db, me).map((p) => p.id));
      const money = canSeeMoney(me);
      return db.events
        .filter((e) => (e.projectId ? visible.has(e.projectId) : me.role !== "freelancer"))
        .filter((e) => !f.projectId || e.projectId === f.projectId || e.projectId === db.projects.find((p) => p.code === f.projectId)?.id)
        .filter((e) => !f.entityType || e.entityType === f.entityType)
        .filter((e) => !f.entityId || e.entityId === f.entityId)
        .filter((e) => !f.clientId || e.clientId === f.clientId)
        .filter((e) => money || !(e.type.includes("value_changed") || e.type.startsWith("receivable") || e.type.startsWith("payable") || e.type.startsWith("proposal")))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, f.limit ?? 200)
        .map((e) => {
          const u = db.users.find((x) => x.id === e.actorId);
          const p = e.projectId ? db.projects.find((x) => x.id === e.projectId) : null;
          return { ...e, actorName: u?.name ?? "Sistema", actorColor: u?.avatarColor ?? "#8a8f98", projectCode: p?.code ?? null, projectTitle: p?.title ?? null };
        });
    }),
};

export const notificationsApi = {
  list: (f: { unread?: boolean; type?: NotificationType } = {}) =>
    read((db, me) =>
      db.notifications
        .filter((n) => n.userId === me.id && !n.deletedAt)
        .filter((n) => !f.unread || !n.readAt)
        .filter((n) => !f.type || n.type === f.type)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((n) => ({ ...n, projectCode: n.projectId ? db.projects.find((p) => p.id === n.projectId)?.code ?? null : null })),
    ),
  unreadCount: () => read((db, me) => db.notifications.filter((n) => n.userId === me.id && !n.readAt && !n.deletedAt).length, 40),
  markRead: (id: ID, read = true) =>
    write((db, me) => {
      const n = db.notifications.find((x) => x.id === id && x.userId === me.id);
      if (n) n.readAt = read ? nowIso() : null;
    }, 60),
  markAllRead: () =>
    write((db, me) => {
      const now = nowIso();
      db.notifications.filter((n) => n.userId === me.id && !n.readAt).forEach((n) => (n.readAt = now));
    }),
  archive: (id: ID) =>
    write((db, me) => {
      const n = db.notifications.find((x) => x.id === id && x.userId === me.id);
      if (n) n.deletedAt = nowIso();
    }, 60),
  preferences: () => read((db, me) => db.notificationPreferences.filter((p) => p.userId === me.id)),
  setPreference: (type: NotificationType, channel: "app" | "email", enabled: boolean) =>
    write((db, me) => {
      const p = db.notificationPreferences.find((x) => x.userId === me.id && x.type === type && x.channel === channel);
      if (p) {
        p.enabled = enabled;
        touch(p);
      } else db.notificationPreferences.push({ ...baseFields(me.id), userId: me.id, type, channel, enabled });
    }, 80),
};
