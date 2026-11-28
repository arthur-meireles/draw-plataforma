/**
 * Drive (arquivos em pastas) — segue a estrutura de pastas da Draw.
 * Pastas reais: tabela `folders` (raízes fixas com `systemKey`, subpastas livres).
 * Pastas virtuais em "01. Projetos": `cli:<clientId>` → `prj:<projectId>` (montadas a partir dos
 * relacionamentos; os arquivos do projeto continuam ligados ao projeto, P1 — projeto no centro).
 */
import { baseFields, nowIso } from "../db";
import type { Database, Folder, ID, User } from "../types";
import { ApiError, emit, read, touch, visibleProjects, write } from "./_core";
import { canWrite, canWriteAll } from "@/lib/permissions";

export const PROJECTS_ROOT = "fld_projetos";

export interface DriveFolder {
  id: string;
  name: string;
  kind: "pasta" | "cliente" | "projeto";
  systemKey: string | null;
  restricted: boolean;
  /** Quantidade de itens diretos (subpastas + arquivos). */
  count: number;
  updatedAt: string | null;
  projectCode?: string;
}

export interface DriveLocation {
  id: string | null;
  breadcrumb: { id: string | null; name: string }[];
  folders: DriveFolder[];
  /** Filtro para listar os arquivos deste local com filesApi.list. */
  files: { folderId?: ID; projectId?: ID } | null;
  canCreateFolder: boolean;
  canUpload: boolean;
  /** Para upload: projeto (pasta virtual) ou pasta real. */
  uploadTarget: { folderId?: ID; projectId?: ID } | null;
}

const canSee = (f: Folder, me: User) => me.role !== "freelancer" && (f.allowedRoles.length === 0 || f.allowedRoles.includes(me.role) || me.role === "admin");

function realChildren(db: Database, me: User, parentId: string | null) {
  return db.folders.filter((f) => !f.deletedAt && f.parentId === parentId && canSee(f, me)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
}

function countReal(db: Database, me: User, id: string) {
  return realChildren(db, me, id).length + db.files.filter((x) => !x.deletedAt && x.folderId === id).length;
}

function pathOf(db: Database, id: string): { id: string | null; name: string }[] {
  const out: { id: string | null; name: string }[] = [];
  let cur = db.folders.find((f) => f.id === id);
  while (cur) {
    out.unshift({ id: cur.id, name: cur.name });
    cur = cur.parentId ? db.folders.find((f) => f.id === cur!.parentId) : undefined;
  }
  return out;
}

export const driveApi = {
  /** Conteúdo de um local do Drive (`null` = raiz). */
  location: (id: string | null) =>
    read((db, me): DriveLocation => {
      const root = { id: null, name: "Arquivos" };
      const projects = visibleProjects(db, me);
      const canEdit = canWriteAll(me, "files");

      // Freelancer: só enxerga 01. Projetos com seus projetos.
      if (me.role === "freelancer" && (id === null || !(id === PROJECTS_ROOT || id.startsWith("cli:") || id.startsWith("prj:")))) id = PROJECTS_ROOT;

      if (id === null) {
        return {
          id: null,
          breadcrumb: [root],
          folders: realChildren(db, me, null).map((f) => ({ id: f.id, name: f.name, kind: "pasta", systemKey: f.systemKey, restricted: f.allowedRoles.length > 0, count: f.id === PROJECTS_ROOT ? new Set(projects.map((p) => p.clientId)).size : countReal(db, me, f.id), updatedAt: f.updatedAt })),
          files: null,
          canCreateFolder: me.role === "admin",
          canUpload: false,
          uploadTarget: null,
        };
      }

      if (id.startsWith("cli:")) {
        const clientId = id.slice(4);
        const client = db.clients.find((c) => c.id === clientId);
        if (!client) throw new ApiError(404, "Pasta não encontrada.");
        const ps = projects.filter((p) => p.clientId === clientId).sort((a, b) => a.code.localeCompare(b.code));
        return {
          id,
          breadcrumb: [root, { id: PROJECTS_ROOT, name: "01. Projetos" }, { id, name: client.tradeName }],
          folders: ps.map((p) => ({ id: `prj:${p.id}`, name: `${p.code} — ${p.title}`, kind: "projeto", systemKey: null, restricted: false, count: db.files.filter((f) => !f.deletedAt && f.projectId === p.id).length, updatedAt: p.updatedAt, projectCode: p.code })),
          files: null,
          canCreateFolder: false,
          canUpload: false,
          uploadTarget: null,
        };
      }

      if (id.startsWith("prj:")) {
        const p = projects.find((x) => x.id === id!.slice(4));
        if (!p) throw new ApiError(404, "Pasta não encontrada.");
        const client = db.clients.find((c) => c.id === p.clientId)!;
        return {
          id,
          breadcrumb: [root, { id: PROJECTS_ROOT, name: "01. Projetos" }, { id: `cli:${client.id}`, name: client.tradeName }, { id, name: `${p.code} — ${p.title}` }],
          folders: [],
          files: { projectId: p.id },
          canCreateFolder: false,
          canUpload: canWrite(me, "files"), // Financeiro (L) só consulta — RN-30
          uploadTarget: canWrite(me, "files") ? { projectId: p.id } : null,
        };
      }

      const folder = db.folders.find((f) => f.id === id && !f.deletedAt);
      if (!folder || (!canSee(folder, me) && !(me.role === "freelancer" && folder.id === PROJECTS_ROOT))) throw new ApiError(404, "Pasta não encontrada.");
      const breadcrumb = [root, ...pathOf(db, folder.id)];
      const sub = realChildren(db, me, folder.id).map<DriveFolder>((f) => ({ id: f.id, name: f.name, kind: "pasta", systemKey: f.systemKey, restricted: f.allowedRoles.length > 0, count: countReal(db, me, f.id), updatedAt: f.updatedAt }));
      if (folder.id === PROJECTS_ROOT) {
        const clientIds = [...new Set(projects.map((p) => p.clientId))];
        const clientFolders = clientIds
          .map((cid) => db.clients.find((c) => c.id === cid)!)
          .filter(Boolean)
          .sort((a, b) => a.tradeName.localeCompare(b.tradeName, "pt-BR"))
          .map<DriveFolder>((c) => ({ id: `cli:${c.id}`, name: c.tradeName, kind: "cliente", systemKey: null, restricted: false, count: projects.filter((p) => p.clientId === c.id).length, updatedAt: null }));
        return { id, breadcrumb, folders: [...sub, ...clientFolders], files: null, canCreateFolder: false, canUpload: false, uploadTarget: null };
      }
      return { id, breadcrumb, folders: sub, files: { folderId: folder.id }, canCreateFolder: canEdit, canUpload: canEdit, uploadTarget: { folderId: folder.id } };
    }, 120),

  /** Árvore de pastas reais (para o painel lateral e o "Mover para…"). */
  tree: () =>
    read((db, me) => db.folders.filter((f) => !f.deletedAt && canSee(f, me)).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR")).map((f) => ({ id: f.id, parentId: f.parentId, name: f.name, systemKey: f.systemKey, restricted: f.allowedRoles.length > 0 })), 60),

  createFolder: (parentId: ID | null, name: string) =>
    write((db, me) => {
      if (!canWriteAll(me, "files")) throw new ApiError(403, "Sem permissão para criar pastas.");
      if (parentId === null && me.role !== "admin") throw new ApiError(403, "Só administradores criam pastas na raiz.");
      if (parentId === PROJECTS_ROOT) throw new ApiError(409, "As pastas de 01. Projetos são criadas automaticamente por cliente e projeto.");
      const clean = name.trim();
      if (!clean) throw new ApiError(422, "Dê um nome à pasta.", { name: "Dê um nome à pasta" });
      if (db.folders.some((f) => !f.deletedAt && f.parentId === parentId && f.name.toLowerCase() === clean.toLowerCase())) throw new ApiError(409, "Já existe uma pasta com esse nome aqui.", { name: "Já existe uma pasta com esse nome aqui" });
      const parent = parentId ? db.folders.find((f) => f.id === parentId) : null;
      const f: Folder = { ...baseFields(me.id), parentId, name: clean, systemKey: null, allowedRoles: parent?.allowedRoles ?? [], order: 999 };
      db.folders.push(f);
      emit(db, me, { type: "folder.created", entityType: "folder", entityId: f.id, data: { name: f.name } });
      return f;
    }),

  renameFolder: (id: ID, name: string) =>
    write((db, me) => {
      const f = db.folders.find((x) => x.id === id && !x.deletedAt);
      if (!f) throw new ApiError(404, "Pasta não encontrada.");
      if (f.systemKey) throw new ApiError(409, "Pastas-raiz da estrutura da Draw não podem ser renomeadas.");
      if (!canWriteAll(me, "files")) throw new ApiError(403, "Sem permissão.");
      if (!name.trim()) throw new ApiError(422, "Dê um nome à pasta.", { name: "Dê um nome à pasta" });
      f.name = name.trim();
      touch(f);
      return f;
    }),

  removeFolder: (id: ID) =>
    write((db, me) => {
      const f = db.folders.find((x) => x.id === id && !x.deletedAt);
      if (!f) throw new ApiError(404, "Pasta não encontrada.");
      if (f.systemKey) throw new ApiError(409, "Pastas-raiz da estrutura da Draw não podem ser excluídas.");
      if (!canWriteAll(me, "files")) throw new ApiError(403, "Sem permissão.");
      // conta TUDO o que há na pasta (inclusive arquivos que este perfil não enxerga) para a mensagem dizer o que falta mover
      const subs = db.folders.filter((x) => !x.deletedAt && x.parentId === id).length;
      const files = db.files.filter((x) => !x.deletedAt && x.folderId === id).length;
      if (subs || files) throw new ApiError(409, `A pasta tem ${[files ? `${files} ${files === 1 ? "arquivo" : "arquivos"}` : "", subs ? `${subs} ${subs === 1 ? "subpasta" : "subpastas"}` : ""].filter(Boolean).join(" e ")}. Mova ou exclua o conteúdo antes de excluir a pasta.`);
      f.deletedAt = nowIso();
      emit(db, me, { type: "folder.deleted", entityType: "folder", entityId: f.id, data: { name: f.name } });
    }),

  /** Move arquivo para uma pasta real (arquivos de projeto ficam no projeto). */
  moveFile: (fileId: ID, folderId: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "files")) throw new ApiError(403, "Sem permissão.");
      const file = db.files.find((x) => x.id === fileId && !x.deletedAt);
      const folder = db.folders.find((x) => x.id === folderId && !x.deletedAt);
      if (!file || !folder) throw new ApiError(404, "Arquivo ou pasta não encontrados.");
      if (file.projectId) throw new ApiError(409, "Arquivos de projeto ficam na pasta do projeto, em 01. Projetos.");
      if (folder.id === PROJECTS_ROOT) throw new ApiError(409, "Escolha uma subpasta.");
      file.folderId = folder.id;
      touch(file);
      emit(db, me, { type: "file.moved", entityType: "file", entityId: file.id, data: { name: file.name, folder: folder.name } });
    }),
};
