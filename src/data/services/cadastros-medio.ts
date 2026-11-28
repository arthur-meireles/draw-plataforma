/**
 * Cadastros — complementos dos furos médios (RN-88, RN-89): grupos econômicos (renomear, excluir, nome único),
 * cliente inativo fora das criações, prévia de inativação e exclusão de freelancer.
 */
import type { Database, ID } from "../types";
import { ApiError, emit, read, requireAccess, touch, write } from "./_core";
import { nowIso } from "../db";

const norm = (s: string) => s.trim().toLocaleLowerCase("pt-BR");

/** Cliente inativo não recebe projeto novo (cotação, direto ou troca de cliente): 409 com o passo seguinte. */
export function assertClientActive(db: Database, clientId: ID) {
  const c = db.clients.find((x) => x.id === clientId && !x.deletedAt);
  if (c && c.status === "inativo") throw new ApiError(409, `${c.tradeName} está inativo. Reative o cliente em Clientes antes de abrir um projeto.`, { clientId: "Cliente inativo: reative-o antes" });
}

/** Nome de grupo único (sem diferenciar maiúsculas); `ignoreId` permite renomear o próprio. */
export function assertGroupNameFree(db: Database, name: string, ignoreId?: ID) {
  if (db.clientGroups.some((g) => !g.deletedAt && g.id !== ignoreId && norm(g.name) === norm(name))) throw new ApiError(409, "Já existe um grupo com este nome.", { name: "Já existe um grupo com este nome" });
}

export const clientGroupsApi = {
  rename: (id: ID, name: string) =>
    write((db, me) => {
      requireAccess(me, "clients", "all", "Seu perfil só consulta clientes. Peça ao Comercial ou à gestão para renomear o grupo.");
      const g = db.clientGroups.find((x) => x.id === id && !x.deletedAt);
      if (!g) throw new ApiError(404, "Grupo não encontrado.");
      if (!name.trim()) throw new ApiError(422, "Dê um nome ao grupo.", { name: "Dê um nome ao grupo" });
      assertGroupNameFree(db, name, id);
      const before = g.name;
      g.name = name.trim();
      touch(g);
      emit(db, me, { type: "client_group.renamed", entityType: "client_group", entityId: g.id, data: { before, after: g.name } });
      return g;
    }),

  /** Só grupo sem empresas pode ser excluído (soft delete — RN-10). */
  remove: (id: ID) =>
    write((db, me) => {
      requireAccess(me, "clients", "all", "Seu perfil só consulta clientes. Peça ao Comercial ou à gestão para excluir o grupo.");
      const g = db.clientGroups.find((x) => x.id === id && !x.deletedAt);
      if (!g) throw new ApiError(404, "Grupo não encontrado.");
      const members = db.clients.filter((c) => c.groupId === id && !c.deletedAt).length;
      if (members) throw new ApiError(409, `Este grupo tem ${members} empresa(s). Tire as empresas do grupo (Editar cliente › Grupo) antes de excluí-lo.`);
      g.deletedAt = nowIso();
      emit(db, me, { type: "client_group.deleted", entityType: "client_group", entityId: g.id, data: { name: g.name } });
    }),
};

export const freelancerLifecycleApi = {
  /** Prévia do "Inativar freelancer…": o que ainda depende dele. */
  inactivationImpact: (id: ID) =>
    read((db, me) => {
      requireAccess(me, "freelancers", "all", "Só quem gerencia freelancers vê isto.");
      const f = db.freelancers.find((x) => x.id === id && !x.deletedAt);
      if (!f) throw new ApiError(404, "Freelancer não encontrado.");
      const projects = db.projectMembers
        .filter((m) => m.freelancerId === id && m.active && !m.deletedAt)
        .map((m) => db.projects.find((p) => p.id === m.projectId && !p.deletedAt))
        .filter((p): p is NonNullable<typeof p> => !!p && (p.status === "ativo" || p.status === "cotacao"));
      return {
        activeProjects: projects.map((p) => ({ code: p.code, title: p.title })),
        openTasks: db.tasks.filter((t) => t.assigneeFreelancerId === id && t.statusKey !== "concluida" && !t.deletedAt).length,
        openPayables: db.payables.filter((p) => p.freelancerId === id && !p.deletedAt && p.status !== "pago" && p.status !== "cancelado").length,
      };
    }, 60),

  /** Exclui cadastro duplicado/errado: só sem alocações nem contas a pagar e sem acesso criado (soft delete — RN-10). */
  remove: (id: ID) =>
    write((db, me) => {
      requireAccess(me, "freelancers", "all", "Só quem gerencia freelancers exclui o cadastro.");
      const f = db.freelancers.find((x) => x.id === id && !x.deletedAt);
      if (!f) throw new ApiError(404, "Freelancer não encontrado.");
      if (db.projectMembers.some((m) => m.freelancerId === id && !m.deletedAt)) throw new ApiError(409, "Este freelancer já participou de projetos e não pode ser excluído. Inative-o para preservar o histórico.");
      if (db.payables.some((p) => p.freelancerId === id && !p.deletedAt)) throw new ApiError(409, "Este freelancer tem contas a pagar e não pode ser excluído. Inative-o para preservar o histórico.");
      if (f.userId) throw new ApiError(409, "Este freelancer tem acesso à plataforma. Desative o usuário em Configurações › Usuários antes de excluir o cadastro.");
      f.deletedAt = nowIso();
      emit(db, me, { type: "freelancer.deleted", entityType: "freelancer", entityId: f.id, data: { name: f.name } });
    }),
};
