/**
 * Quem recebe o quê na Caixa de entrada (RN-53). A caixa mostra só o que envolve a pessoa ou se relaciona
 * diretamente com ela — inclusive para o Administrador (não existe "feed de tudo").
 */
import type { Database, ID, NotificationType, Project, User } from "../types";
import { notify } from "./_core";

/** userId do freelancer (quando ele tem acesso à plataforma). */
export const freelancerUserId = (db: Database, freelancerId: ID | null | undefined): ID | null =>
  freelancerId ? (db.freelancers.find((f) => f.id === freelancerId)?.userId ?? null) : null;

/**
 * Pessoas ligadas ao projeto: responsável + membros ativos (internos e freelancers com acesso).
 * Só usuários ativos; sem repetição.
 */
export function projectAudience(db: Database, p: Project, opts: { freelancers?: boolean } = {}): ID[] {
  const withFreelancers = opts.freelancers ?? true;
  const ids = new Set<ID>([p.ownerId]);
  db.projectMembers
    .filter((m) => m.projectId === p.id && m.active && !m.deletedAt)
    .forEach((m) => {
      if (m.userId) ids.add(m.userId);
      else if (withFreelancers) {
        const uid = freelancerUserId(db, m.freelancerId);
        if (uid) ids.add(uid);
      }
    });
  return [...ids].filter((id) => db.users.some((u) => u.id === id && u.status === "ativo"));
}

/** Pessoas que podem ser mencionadas num comentário do projeto (mesma regra da audiência, com freelancers). */
export function mentionableUserIds(db: Database, p: Project): Set<ID> {
  return new Set(projectAudience(db, p, { freelancers: true }));
}

/** Notifica uma lista de pessoas (sem repetir e nunca quem fez a ação — `notify` já ignora o autor). */
export function notifyMany(
  db: Database,
  me: User | null,
  userIds: (ID | null | undefined)[],
  n: { type: NotificationType; title: string; body?: string; project?: Project | null; entityType?: string; entityId?: ID },
) {
  const seen = new Set<ID>();
  for (const id of userIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    notify(db, me, { ...n, userId: id });
  }
}
