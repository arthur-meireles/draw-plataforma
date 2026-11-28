import { baseFields, nowIso } from "../db";
import type { AdmArea, Database, ID, PriorityKey, Project, Task, TaskStatusKey, User } from "../types";
import { ApiError, assertProjectVisible, emit, freelancerIdOf, notify, read, requireAccess, touch, visibleProjects, write } from "./_core";
import { notifyMany } from "./audience";
import { canRead, canWrite, canWriteAll } from "@/lib/permissions";

export interface TaskFilters {
  projectId?: ID;
  module?: Task["module"];
  assignee?: "me" | ID;
  statusKey?: TaskStatusKey[];
  sprintId?: ID | "backlog";
  parentTaskId?: ID | null;
  includeSubtasks?: boolean;
  /** RN-57 — em `assignee: "me"`, tarefas de projetos concluídos/cancelados/perdidos/arquivados ficam fora por padrão. */
  includeClosedProjects?: boolean;
  q?: string;
}

export interface TaskView extends Task {
  projectCode: string | null;
  projectTitle: string | null;
  clientName: string | null;
  assigneeName: string | null;
  assigneeColor: string | null;
  subtasksDone: number;
  subtasksTotal: number;
  commentsCount: number;
  isOverdue: boolean;
  /** RN-38 — quem está logado pode mudar o status (editor da tarefa ou responsável por tarefa ADM). Só nas respostas de `list`/`get`. */
  canChangeStatus?: boolean;
  /** Título da tarefa-pai, quando é subtarefa (Minhas tarefas mostra "↳ pai"). */
  parentTitle: string | null;
  projectStatus: Project["status"] | null;
  /** Projeto pausado ou encerrado: a tarefa não conta como atrasada (RN-13 / RN-57). */
  projectOnHold: boolean;
}

/** Status de projeto em que tarefas seguem em andamento. */
const OPEN_PROJECT_STATUSES: Project["status"][] = ["ativo", "cotacao"];

export function toTaskView(db: Database, t: Task): TaskView {
  const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) : null;
  const client = p ? db.clients.find((c) => c.id === p.clientId) : null;
  const u = t.assigneeUserId ? db.users.find((x) => x.id === t.assigneeUserId) : null;
  const f = t.assigneeFreelancerId ? db.freelancers.find((x) => x.id === t.assigneeFreelancerId) : null;
  const subs = db.tasks.filter((x) => x.parentTaskId === t.id && !x.deletedAt);
  const onHold = !!p && (!!p.pausedAt || !OPEN_PROJECT_STATUSES.includes(p.status));
  return {
    ...t,
    projectCode: p?.code ?? null,
    projectTitle: p?.title ?? null,
    clientName: client?.tradeName ?? null,
    assigneeName: u?.name ?? f?.name ?? null,
    assigneeColor: u?.avatarColor ?? f?.avatarColor ?? null,
    subtasksDone: subs.filter((s) => s.statusKey === "concluida").length,
    subtasksTotal: subs.length,
    commentsCount: db.comments.filter((c) => c.taskId === t.id && !c.deletedAt).length,
    isOverdue: !onHold && t.statusKey !== "concluida" && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now(),
    parentTitle: t.parentTaskId ? (db.tasks.find((x) => x.id === t.parentTaskId)?.title ?? null) : null,
    projectStatus: p?.status ?? null,
    projectOnHold: onHold,
  };
}

/** Tarefas que o usuário pode ver (mesmo recorte na busca global). */
export function visibleTasks(db: Database, me: User): Task[] {
  const projectIds = new Set(visibleProjects(db, me).map((p) => p.id));
  const flId = freelancerIdOf(db, me);
  return db.tasks.filter((t) => {
    if (t.deletedAt) return false;
    if (t.module === "adm") return canRead(me, "adm");
    if (!t.projectId || !projectIds.has(t.projectId)) return false;
    if (me.role === "freelancer") return true; // vê as tarefas dos projetos onde está alocado
    return true;
  }).filter((t) => (me.role === "freelancer" ? t.assigneeFreelancerId === flId || t.module === "projeto" : true));
}

function assertTask(db: Database, me: User, id: ID): Task {
  const t = visibleTasks(db, me).find((x) => x.id === id);
  if (!t) throw new ApiError(404, "Tarefa não encontrada.");
  return t;
}

function canEditTask(db: Database, me: User, t: Task) {
  if (t.module === "adm") return canWriteAll(me, "adm");
  if (canWriteAll(me, "tasks")) return true;
  if (!canWrite(me, "tasks")) return false; // L (Financeiro) só consulta tarefas de projeto
  const flId = freelancerIdOf(db, me);
  return t.assigneeUserId === me.id || (!!flId && t.assigneeFreelancerId === flId) || me.role === "operacao";
}

/**
 * RN-38 — responsável por tarefa ADM sem Administrativo T (Operação, Financeiro, Comercial: L) pode mudar o
 * status da própria tarefa (andar, concluir, reabrir). Os demais campos seguem com quem gerencia o Administrativo.
 */
function isAdmAssigneeOnly(me: User, t: Task) {
  return t.module === "adm" && !canWriteAll(me, "adm") && t.assigneeUserId === me.id;
}

const canChangeStatus = (db: Database, me: User, t: Task) => canEditTask(db, me, t) || isAdmAssigneeOnly(me, t);

export const tasksApi = {
  list: (f: TaskFilters = {}) =>
    read((db, me) => {
      const flId = freelancerIdOf(db, me);
      const q = f.q?.trim().toLowerCase();
      return visibleTasks(db, me)
        .filter((t) => {
          if (f.projectId && t.projectId !== f.projectId) return false;
          if (f.module && t.module !== f.module) return false;
          if (f.assignee === "me" && !(t.assigneeUserId === me.id || (flId && t.assigneeFreelancerId === flId))) return false;
          if (f.assignee && f.assignee !== "me" && t.assigneeUserId !== f.assignee && t.assigneeFreelancerId !== f.assignee) return false;
          if (f.statusKey && !f.statusKey.includes(t.statusKey)) return false;
          if (f.sprintId === "backlog" && t.sprintId) return false;
          if (f.sprintId && f.sprintId !== "backlog" && t.sprintId !== f.sprintId) return false;
          if (f.parentTaskId !== undefined && t.parentTaskId !== f.parentTaskId) return false;
          // RN-57 — em "Minhas tarefas" as subtarefas atribuídas a mim também aparecem.
          if (!f.includeSubtasks && f.assignee !== "me" && f.parentTaskId === undefined && t.parentTaskId) return false;
          if (f.assignee === "me" && !f.includeClosedProjects && t.projectId) {
            const st = db.projects.find((x) => x.id === t.projectId)?.status;
            if (st && !OPEN_PROJECT_STATUSES.includes(st)) return false;
          }
          if (q && !t.title.toLowerCase().includes(q)) return false;
          return true;
        })
        .sort((a, b) => a.position - b.position)
        .map((t) => ({ ...toTaskView(db, t), canChangeStatus: canChangeStatus(db, me, t) }));
    }),

  get: (id: ID) =>
    read((db, me) => {
      const t = assertTask(db, me, id);
      return {
        ...toTaskView(db, t),
        subtasks: db.tasks.filter((x) => x.parentTaskId === t.id && !x.deletedAt).sort((a, b) => a.position - b.position).map((x) => ({ ...toTaskView(db, x), canChangeStatus: canChangeStatus(db, me, x) })),
        canEdit: canEditTask(db, me, t),
        canChangeStatus: canChangeStatus(db, me, t),
      };
    }),

  create: (input: {
    projectId?: ID | null;
    module?: Task["module"];
    parentTaskId?: ID | null;
    stageKey?: Task["stageKey"];
    title: string;
    description?: string | null;
    assigneeUserId?: ID | null;
    assigneeFreelancerId?: ID | null;
    priorityKey?: PriorityKey;
    statusKey?: TaskStatusKey;
    startAt?: string | null;
    dueAt?: string | null;
    estimateMinutes?: number | null;
    sprintId?: ID | null;
    area?: AdmArea | null;
  }) =>
    write((db, me) => {
      if (!input.title.trim()) throw new ApiError(422, "Dê um título para a tarefa.", { title: "Dê um título para a tarefa" });
      const taskModule = input.module ?? (input.projectId ? "projeto" : "adm");
      const p = input.projectId ? assertProjectVisible(db, me, input.projectId) : null;
      if (taskModule === "adm" && !canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão no Administrativo.");
      if (taskModule === "projeto") requireAccess(me, "tasks", "write", "Seu perfil só consulta tarefas de projeto. Peça ao responsável do projeto para criar a tarefa.");
      if (taskModule === "projeto" && me.role === "freelancer" && !input.parentTaskId) throw new ApiError(403, "Freelancers só criam subtarefas.");
      if (p && !OPEN_PROJECT_STATUSES.includes(p.status)) throw new ApiError(409, "Este projeto está encerrado e não recebe tarefas novas. Reabra o projeto para continuar.");
      const siblings = db.tasks.filter((t) => t.projectId === (p?.id ?? null) && t.parentTaskId === (input.parentTaskId ?? null));
      const parent = input.parentTaskId ? db.tasks.find((t) => t.id === input.parentTaskId) : null;
      const t: Task = {
        ...baseFields(me.id),
        projectId: p?.id ?? null,
        module: taskModule,
        parentTaskId: input.parentTaskId ?? null,
        stageKey: input.stageKey ?? parent?.stageKey ?? (p?.status === "cotacao" ? p.quoteStageKey : (p?.projectStageKey ?? null)),
        title: input.title.trim(),
        description: input.description ?? null,
        assigneeUserId: input.assigneeUserId ?? (input.assigneeFreelancerId ? null : (parent?.assigneeUserId ?? null)),
        assigneeFreelancerId: input.assigneeFreelancerId ?? (input.assigneeUserId ? null : (parent?.assigneeFreelancerId ?? null)),
        statusKey: input.statusKey ?? "a_fazer",
        priorityKey: input.priorityKey ?? "media",
        startAt: input.startAt ?? null,
        dueAt: input.dueAt ?? parent?.dueAt ?? null,
        estimateMinutes: input.estimateMinutes ?? null,
        position: Math.max(0, ...siblings.map((s) => s.position)) + 1000,
        sprintId: input.sprintId ?? null,
        completedAt: null,
        area: input.area ?? parent?.area ?? null,
      };
      db.tasks.push(t);
      emit(db, me, { type: "task.created", entityType: "task", entityId: t.id, project: p, data: { title: t.title } });
      const flUser = t.assigneeFreelancerId ? db.freelancers.find((f) => f.id === t.assigneeFreelancerId)?.userId : null;
      notify(db, me, { userId: t.assigneeUserId ?? flUser, type: "atribuicao", title: `Nova tarefa: ${t.title}`, project: p, entityType: "task", entityId: t.id });
      return t;
    }),

  update: (id: ID, patch: Partial<Pick<Task, "title" | "description" | "assigneeUserId" | "assigneeFreelancerId" | "statusKey" | "priorityKey" | "startAt" | "dueAt" | "estimateMinutes" | "sprintId" | "stageKey" | "position" | "area">>) =>
    write((db, me) => {
      const t = assertTask(db, me, id);
      if (!canEditTask(db, me, t)) {
        const statusOnly = Object.keys(patch).every((k) => k === "statusKey");
        if (!isAdmAssigneeOnly(me, t)) throw new ApiError(403, "Você não pode editar esta tarefa.");
        if (!statusOnly) throw new ApiError(403, "Nas tarefas do Administrativo você pode mudar só o status das suas. Peça à gestão para alterar prazo, responsável ou área.");
      }
      const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) ?? null : null;
      const before = { ...t };
      Object.assign(t, patch);
      if (patch.statusKey) t.completedAt = patch.statusKey === "concluida" ? (before.completedAt ?? nowIso()) : null;
      if (patch.assigneeUserId) t.assigneeFreelancerId = null;
      if (patch.assigneeFreelancerId) t.assigneeUserId = null;
      touch(t);
      if (patch.statusKey && patch.statusKey !== before.statusKey) {
        emit(db, me, { type: "task.status_changed", entityType: "task", entityId: t.id, project: p, data: { from: before.statusKey, to: patch.statusKey, title: t.title } });
        // RN-53 — tarefa em revisão avisa o responsável do projeto e quem pediu a tarefa.
        if (patch.statusKey === "em_revisao") notifyMany(db, me, [p?.ownerId, t.createdBy], { type: "revisao", title: `Tarefa para revisar: ${t.title}`, body: `${me.name} enviou para revisão`, project: p, entityType: "task", entityId: t.id });
        // RN-57 — hand-off: concluída avisa o responsável do projeto e quem pediu; voltou da revisão avisa quem executa.
        if (patch.statusKey === "concluida") notifyMany(db, me, [p?.ownerId, t.createdBy], { type: "revisao", title: `Tarefa concluída: ${t.title}`, body: `${me.name} concluiu`, project: p, entityType: "task", entityId: t.id });
        if (before.statusKey === "em_revisao" && (patch.statusKey === "a_fazer" || patch.statusKey === "em_andamento")) {
          const assignee = t.assigneeUserId ?? (t.assigneeFreelancerId ? db.freelancers.find((f) => f.id === t.assigneeFreelancerId)?.userId : null);
          notifyMany(db, me, [assignee], { type: "revisao", title: `Tarefa voltou da revisão: ${t.title}`, body: `${me.name} pediu ajustes`, project: p, entityType: "task", entityId: t.id });
        }
      }
      if ((patch.assigneeUserId && patch.assigneeUserId !== before.assigneeUserId) || (patch.assigneeFreelancerId && patch.assigneeFreelancerId !== before.assigneeFreelancerId)) {
        const flUser = t.assigneeFreelancerId ? db.freelancers.find((f) => f.id === t.assigneeFreelancerId)?.userId : null;
        notify(db, me, { userId: t.assigneeUserId ?? flUser, type: "atribuicao", title: `Tarefa atribuída: ${t.title}`, project: p, entityType: "task", entityId: t.id });
        emit(db, me, { type: "task.assigned", entityType: "task", entityId: t.id, project: p, data: { title: t.title } });
      }
      if (patch.dueAt !== undefined && patch.dueAt !== before.dueAt) emit(db, me, { type: "task.due_changed", entityType: "task", entityId: t.id, project: p, data: { from: before.dueAt, to: patch.dueAt, title: t.title } });
      return t;
    }),

  remove: (id: ID) =>
    write((db, me) => {
      const t = assertTask(db, me, id);
      if (!canEditTask(db, me, t) || me.role === "freelancer") throw new ApiError(403, "Você não pode excluir esta tarefa.");
      const now = nowIso();
      t.deletedAt = now;
      db.tasks.filter((x) => x.parentTaskId === t.id).forEach((x) => (x.deletedAt = now));
      emit(db, me, { type: "task.deleted", entityType: "task", entityId: t.id, project: t.projectId ? db.projects.find((p) => p.id === t.projectId) : null, data: { title: t.title } });
    }),

  /** Sprints do módulo Administrativo (RF-M6-01). */
  sprints: () => read((db, me) => (requireAccess(me, "adm", "read"), db.sprints.filter((s) => !s.deletedAt).sort((a, b) => a.startAt.localeCompare(b.startAt)))),

  createSprint: (input: { name: string; startAt: string; endAt: string }) =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      if (!input.name.trim()) throw new ApiError(422, "Dê um nome à sprint.", { name: "Dê um nome à sprint" });
      if (input.endAt < input.startAt) throw new ApiError(422, "A data final deve ser depois da inicial.", { endAt: "A data final deve ser depois da inicial" });
      const s = { ...baseFields(me.id), name: input.name.trim(), startAt: input.startAt, endAt: input.endAt, status: "planejada" as const };
      db.sprints.push(s);
      return s;
    }),

  /** RN-78 — editar nome/datas de sprint planejada ou em andamento. `PATCH /sprints/:id`. */
  updateSprint: (id: ID, input: { name: string; startAt: string; endAt: string }) =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Só quem gerencia o Administrativo edita sprints. Peça à gestão.");
      const s = db.sprints.find((x) => x.id === id && !x.deletedAt);
      if (!s) throw new ApiError(404, "Sprint não encontrada.");
      if (s.status === "concluida") throw new ApiError(409, "Sprint concluída não pode ser editada.");
      if (!input.name.trim()) throw new ApiError(422, "Dê um nome à sprint.", { name: "Dê um nome à sprint" });
      if (input.endAt < input.startAt) throw new ApiError(422, "A data final deve ser depois da inicial.", { endAt: "A data final deve ser depois da inicial" });
      Object.assign(s, { name: input.name.trim(), startAt: input.startAt, endAt: input.endAt });
      touch(s);
      emit(db, me, { type: "sprint.updated", entityType: "sprint", entityId: s.id, data: { name: s.name } });
      return s;
    }),

  /** RN-78 — excluir sprint planejada: as tarefas dela voltam ao backlog. `DELETE /sprints/:id`. */
  deleteSprint: (id: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Só quem gerencia o Administrativo exclui sprints. Peça à gestão.");
      const s = db.sprints.find((x) => x.id === id && !x.deletedAt);
      if (!s) throw new ApiError(404, "Sprint não encontrada.");
      if (s.status !== "planejada") throw new ApiError(409, s.status === "ativa" ? "Sprint em andamento não se exclui: conclua a sprint para encerrar o ciclo." : "Sprint concluída fica no histórico e não pode ser excluída.");
      const tasks = db.tasks.filter((t) => t.sprintId === s.id && !t.deletedAt);
      tasks.forEach((t) => {
        t.sprintId = null;
        touch(t);
      });
      s.deletedAt = nowIso();
      emit(db, me, { type: "sprint.deleted", entityType: "sprint", entityId: s.id, data: { name: s.name, movedToBacklog: tasks.length } });
      return { moved: tasks.length };
    }),

  /**
   * Iniciar/concluir sprint. RN-78 — iniciar uma sprint com outra ativa conclui a ativa pela MESMA rotina de
   * `finishSprint` (pendências voltam ao backlog e sai o evento `sprint.finished`); concluir por aqui idem.
   */
  setSprintStatus: (id: ID, status: "planejada" | "ativa" | "concluida") =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      const s = db.sprints.find((x) => x.id === id && !x.deletedAt);
      if (!s) throw new ApiError(404, "Sprint não encontrada.");
      if (status === "concluida") return closeSprint(db, me, s, "backlog").sprint;
      if (status === "ativa") db.sprints.filter((x) => x.status === "ativa" && x.id !== s.id && !x.deletedAt).forEach((x) => closeSprint(db, me, x, "backlog"));
      s.status = status;
      touch(s);
      return s;
    }),
};

/** RN-78 — conclusão de sprint (única): devolve pendências ao backlog (ou mantém na sprint) e registra `sprint.finished`. */
export function closeSprint(db: Database, me: User, s: { id: ID; name: string; status: "planejada" | "ativa" | "concluida"; updatedAt: string }, unfinished: "backlog" | "keep") {
  if (s.status === "concluida") throw new ApiError(409, "Esta sprint já foi concluída.");
  s.status = "concluida";
  touch(s);
  let moved = 0;
  if (unfinished === "backlog") {
    db.tasks
      .filter((t) => t.sprintId === s.id && t.module === "adm" && !t.deletedAt && t.statusKey !== "concluida")
      .forEach((t) => {
        t.sprintId = null;
        touch(t);
        moved++;
      });
  }
  emit(db, me, { type: "sprint.finished", entityType: "sprint", entityId: s.id, data: { name: s.name, movedToBacklog: moved } });
  return { moved, sprint: s };
}
