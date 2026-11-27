/**
 * Gestão de usuários — furos da onda 2 (RN-35, RN-36, RN-60): cancelar convite, perfil Freelancer sempre ligado
 * a um cadastro de freelancer, perfil coerente com o tipo do usuário e inativação com reatribuição do que a
 * pessoa tinha. Toda alteração de acesso entra no log de acessos (trilha de segurança).
 */
import { baseFields, nowIso } from "../db";
import { ROLE_LABEL } from "../reference";
import type { AccessLogAction, Database, Freelancer, ID, Role, User } from "../types";
import { ApiError, emit, notify, read, requireAccess, touch, write } from "./_core";

/** RN-60 — registro único da trilha de segurança (quem fez, o quê, sobre quem). */
export function securityLog(db: Database, actorId: ID | null, action: AccessLogAction, detail: string | null = null) {
  db.accessLogs.push({ ...baseFields(actorId), userId: actorId, action, detail, at: nowIso() });
}

/** Tipo do usuário derivado do perfil (RN-35): perfil Freelancer ⇔ `userType = freelancer`. */
export const userTypeOf = (role: Role): User["userType"] => (role === "freelancer" ? "freelancer" : "internal");

const FREELANCER_COLORS = ["#0891b2", "#7c3aed", "#db2777", "#0fa37f", "#d97706"];

/**
 * RN-35 — garante o cadastro de freelancer ligado ao usuário (perfil Freelancer). Reaproveita o cadastro com o
 * mesmo e-mail (sem acesso ainda) ou cria um mínimo, marcado para o Financeiro completar os dados.
 */
export function ensureFreelancerRecord(db: Database, me: User, u: User): Freelancer {
  const linked = db.freelancers.find((f) => f.userId === u.id && !f.deletedAt);
  if (linked) {
    if (linked.status !== "ativo" && u.status !== "inativo") linked.status = "ativo";
    return linked;
  }
  const byEmail = db.freelancers.find((f) => !f.deletedAt && f.email.toLowerCase() === u.email.toLowerCase());
  if (byEmail?.userId && byEmail.userId !== u.id) throw new ApiError(409, "Já existe um freelancer com este e-mail ligado a outro acesso. Confira o cadastro em Cadastros › Freelancers.");
  if (byEmail) {
    byEmail.userId = u.id;
    byEmail.status = "ativo";
    touch(byEmail);
    emit(db, me, { type: "freelancer.linked_to_user", entityType: "freelancer", entityId: byEmail.id, data: { userId: u.id } });
    return byEmail;
  }
  const f: Freelancer = {
    ...baseFields(me.id),
    userId: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    legalName: null,
    document: null,
    pixKey: null,
    bankName: null,
    bankAgency: null,
    bankAccount: null,
    jobTitle: null,
    specialties: ["outro"],
    status: "ativo",
    notes: "Cadastro criado pelo convite em Configurações › Usuários — complete cargo, especialidades e dados bancários.",
    avatarColor: FREELANCER_COLORS[db.freelancers.length % FREELANCER_COLORS.length],
  };
  db.freelancers.push(f);
  emit(db, me, { type: "freelancer.created", entityType: "freelancer", entityId: f.id, data: { name: f.name, via: "convite_usuario" } });
  return f;
}

/** O que fica "órfão" quando a pessoa é inativada (RN-36). */
function pendingOf(db: Database, u: User) {
  const projects = db.projects.filter((p) => !p.deletedAt && p.ownerId === u.id && (p.status === "ativo" || p.status === "cotacao"));
  const tasks = db.tasks.filter((t) => !t.deletedAt && t.statusKey !== "concluida" && t.assigneeUserId === u.id);
  const memberships = db.projectMembers.filter((m) => m.active && !m.deletedAt && m.userId === u.id && db.projects.some((p) => p.id === m.projectId && !p.deletedAt && (p.status === "ativo" || p.status === "cotacao")));
  return { projects, tasks, memberships };
}

export const usersExtraApi = {
  /**
   * RN-36 — o que a pessoa ainda tem antes de inativar: projetos em que é responsável (cotação/ativo), tarefas
   * abertas atribuídas e equipes de que participa. A tela oferece reatribuir. `GET /users/:id/deactivation-impact`.
   */
  deactivationImpact: (id: ID) =>
    read((db, me) => {
      requireAccess(me, "users", "all", "Só administradores inativam usuários.");
      const u = db.users.find((x) => x.id === id && !x.deletedAt);
      if (!u) throw new ApiError(404, "Usuário não encontrado.");
      const { projects, tasks, memberships } = pendingOf(db, u);
      return {
        projects: projects.map((p) => ({ id: p.id, code: p.code, title: p.title })),
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, projectCode: db.projects.find((p) => p.id === t.projectId)?.code ?? null })),
        memberships: memberships.length,
        /** Quem pode assumir: interno ativo com escrita em projetos (não a própria pessoa). */
        candidates: db.users
          .filter((x) => x.id !== u.id && x.status === "ativo" && !x.deletedAt && x.userType === "internal" && ["admin", "gestao", "comercial", "operacao"].includes(x.role))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .map((x) => ({ id: x.id, name: x.name, role: x.role, color: x.avatarColor })),
      };
    }, 80),

  /**
   * RN-36 — inativa e reatribui numa transação: projetos (cotação/ativo) e tarefas abertas passam para `reassignTo`
   * (que é avisado), a pessoa sai das equipes ativas, sessões caem e o cadastro de freelancer ligado fica inativo.
   * Com projetos sob responsabilidade é obrigatório escolher quem assume. `POST /users/:id/deactivate`.
   */
  deactivate: (id: ID, input: { reassignTo?: ID | null } = {}) =>
    write((db, me) => {
      requireAccess(me, "users", "all", "Só administradores inativam usuários.");
      if (id === me.id) throw new ApiError(409, "Você não pode inativar a si mesmo.");
      const u = db.users.find((x) => x.id === id && !x.deletedAt);
      if (!u) throw new ApiError(404, "Usuário não encontrado.");
      if (u.status === "convidado") throw new ApiError(409, "Este convite ainda não foi aceito. Use \"Cancelar convite…\".");
      if (u.status === "inativo") throw new ApiError(409, "Este usuário já está inativo.");
      if (u.role === "admin" && db.users.filter((x) => x.role === "admin" && x.status === "ativo").length === 1) throw new ApiError(409, "Esta é a única pessoa administradora. Promova outra pessoa antes.");
      const { projects, tasks, memberships } = pendingOf(db, u);
      const heir = input.reassignTo ? db.users.find((x) => x.id === input.reassignTo && x.id !== u.id && x.status === "ativo" && !x.deletedAt && x.userType === "internal") : null;
      if (input.reassignTo && !heir) throw new ApiError(422, "Escolha uma pessoa interna e ativa para assumir.", { reassignTo: "Escolha quem assume" });
      if (projects.length && !heir) throw new ApiError(422, `${u.name} é responsável por ${projects.length} projeto(s). Escolha quem assume antes de inativar.`, { reassignTo: "Escolha quem assume os projetos" });

      projects.forEach((p) => {
        p.ownerId = heir!.id;
        touch(p);
        emit(db, me, { type: "project.owner_changed", entityType: "project", entityId: p.id, project: p, data: { from: u.id, to: heir!.id, reason: "inativacao" } });
        notify(db, me, { userId: heir!.id, type: "atribuicao", title: "Você agora é responsável por este projeto", body: `${u.name} foi inativado(a)`, project: p });
      });
      tasks.forEach((t) => {
        t.assigneeUserId = heir?.id ?? null;
        touch(t);
        const p = t.projectId ? (db.projects.find((x) => x.id === t.projectId) ?? null) : null;
        emit(db, me, { type: "task.assigned", entityType: "task", entityId: t.id, project: p, data: { title: t.title, from: u.id, to: heir?.id ?? null, reason: "inativacao" } });
      });
      if (heir && tasks.length) notify(db, me, { userId: heir.id, type: "atribuicao", title: `${tasks.length} tarefa(s) de ${u.name} agora são suas`, body: "Reatribuídas na inativação" });
      memberships.forEach((m) => {
        m.active = false;
        touch(m);
      });

      u.status = "inativo";
      u.sessionVersion = (u.sessionVersion ?? 0) + 1; // a sessão aberta cai na hora
      touch(u);
      db.freelancers.filter((f) => f.userId === u.id && !f.deletedAt).forEach((f) => {
        f.status = "inativo";
        touch(f);
      });
      emit(db, me, { type: "user.deactivated", entityType: "user", entityId: u.id, data: { reassignTo: heir?.id ?? null, projects: projects.length, tasks: tasks.length } });
      securityLog(db, me.id, "user_deactivated", `${u.name}${heir ? ` · pendências com ${heir.name}` : ""}`);
      return { projects: projects.length, tasks: tasks.length, memberships: memberships.length };
    }),

  /** Reativar: volta o acesso e o cadastro de freelancer ligado (RN-36). `POST /users/:id/reactivate`. */
  reactivate: (id: ID) =>
    write((db, me) => {
      requireAccess(me, "users", "all", "Só administradores reativam usuários.");
      const u = db.users.find((x) => x.id === id && !x.deletedAt);
      if (!u || u.status !== "inativo") throw new ApiError(404, "Usuário inativo não encontrado.");
      u.status = "ativo";
      touch(u);
      db.freelancers.filter((f) => f.userId === u.id && !f.deletedAt).forEach((f) => {
        f.status = "ativo";
        touch(f);
      });
      emit(db, me, { type: "user.reactivated", entityType: "user", entityId: u.id, data: {} });
      securityLog(db, me.id, "user_reactivated", u.name);
    }),

  /**
   * RN-35 — cancelar convite pendente: revoga o link (deixa de abrir na hora), remove o usuário convidado (exclusão
   * lógica; o e-mail fica livre para um novo convite) e desliga o cadastro de freelancer do acesso.
   * `POST /users/:id/cancel-invite`.
   */
  cancelInvite: (id: ID) =>
    write((db, me) => {
      requireAccess(me, "users", "all", "Só administradores cancelam convites.");
      const u = db.users.find((x) => x.id === id && !x.deletedAt);
      if (!u || u.status !== "convidado") throw new ApiError(409, "Só convites pendentes podem ser cancelados. Se a pessoa já entrou, inative o usuário.");
      const now = nowIso();
      (db.userInvites ??= []).filter((i) => i.userId === u.id && !i.usedAt && !i.revokedAt).forEach((i) => (i.revokedAt = now));
      u.deletedAt = now;
      touch(u);
      db.freelancers.filter((f) => f.userId === u.id).forEach((f) => {
        f.userId = null;
        touch(f);
      });
      emit(db, me, { type: "user.invite_cancelled", entityType: "user", entityId: u.id, data: { email: u.email } });
      securityLog(db, me.id, "invite_cancelled", `${u.name} <${u.email}>`);
    }),
};

/** Texto do log para troca de perfil. */
export const roleChangeDetail = (u: User, from: Role, to: Role) => `${u.name}: ${ROLE_LABEL[from]} → ${ROLE_LABEL[to]}`;
