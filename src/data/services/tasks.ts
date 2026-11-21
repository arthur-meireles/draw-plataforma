import { baseFields, nowIso } from "../db";
import type { Database, ID, PriorityKey, Task, TaskStatusKey, User } from "../types";
import { ApiError, assertProjectVisible, emit, freelancerIdOf, notify, read, touch, visibleProjects, write } from "./_core";
import { canRead, canWriteAll } from "@/lib/permissions";

export interface TaskFilters {
  projectId?: ID;
  module?: Task["module"];
  assignee?: "me" | ID;
  statusKey?: TaskStatusKey[];
  sprintId?: ID | "backlog";
  parentTaskId?: ID | null;
  includeSubtasks?: boolean;
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
}

export function toTaskView(db: Database, t: Task): TaskView {
  const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) : null;
  const client = p ? db.clients.find((c) => c.id === p.clientId) : null;
  const u = t.assigneeUserId ? db.users.find((x) => x.id === t.assigneeUserId) : null;
  const f = t.assigneeFreelancerId ? db.freelancers.find((x) => x.id === t.assigneeFreelancerId) : null;
  const subs = db.tasks.filter((x) => x.parentTaskId === t.id && !x.deletedAt);
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
    isOverdue: t.statusKey !== "concluida" && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now(),
  };
}

function visibleTasks(db: Database, me: User): Task[] {
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
  if (canWriteAll(me, "tasks")) return true;
  if (t.module === "adm") return canWriteAll(me, "adm");
  const flId = freelancerIdOf(db, me);
  return t.assigneeUserId === me.id || (!!flId && t.assigneeFreelancerId === flId) || me.role === "operacao";
}

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
          if (!f.includeSubtasks && f.parentTaskId === undefined && t.parentTaskId) return false;
          if (q && !t.title.toLowerCase().includes(q)) return false;
          return true;
        })
        .sort((a, b) => a.position - b.position)
        .map((t) => toTaskView(db, t));
    }),

  get: (id: ID) =>
    read((db, me) => {
      const t = assertTask(db, me, id);
      return {
        ...toTaskView(db, t),
        subtasks: db.tasks.filter((x) => x.parentTaskId === t.id && !x.deletedAt).sort((a, b) => a.position - b.position).map((x) => toTaskView(db, x)),
        canEdit: canEditTask(db, me, t),
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
  }) =>
    write((db, me) => {
      if (!input.title.trim()) throw new ApiError(422, "Dê um título para a tarefa.", { title: "Dê um título para a tarefa" });
      const module = input.module ?? (input.projectId ? "projeto" : "adm");
      const p = input.projectId ? assertProjectVisible(db, me, input.projectId) : null;
      if (module === "adm" && !canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão no Administrativo.");
      if (module === "projeto" && me.role === "freelancer" && !input.parentTaskId) throw new ApiError(403, "Freelancers só criam subtarefas.");
      const siblings = db.tasks.filter((t) => t.projectId === (p?.id ?? null) && t.parentTaskId === (input.parentTaskId ?? null));
      const parent = input.parentTaskId ? db.tasks.find((t) => t.id === input.parentTaskId) : null;
      const t: Task = {
        ...baseFields(me.id),
        projectId: p?.id ?? null,
        module,
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
      };
      db.tasks.push(t);
      emit(db, me, { type: "task.created", entityType: "task", entityId: t.id, project: p, data: { title: t.title } });
      const flUser = t.assigneeFreelancerId ? db.freelancers.find((f) => f.id === t.assigneeFreelancerId)?.userId : null;
      notify(db, me, { userId: t.assigneeUserId ?? flUser, type: "atribuicao", title: `Nova tarefa: ${t.title}`, project: p, entityType: "task", entityId: t.id });
      return t;
    }),

  update: (id: ID, patch: Partial<Pick<Task, "title" | "description" | "assigneeUserId" | "assigneeFreelancerId" | "statusKey" | "priorityKey" | "startAt" | "dueAt" | "estimateMinutes" | "sprintId" | "stageKey" | "position">>) =>
    write((db, me) => {
      const t = assertTask(db, me, id);
      if (!canEditTask(db, me, t)) throw new ApiError(403, "Você não pode editar esta tarefa.");
      const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) ?? null : null;
      const before = { ...t };
      Object.assign(t, patch);
      if (patch.statusKey) t.completedAt = patch.statusKey === "concluida" ? (before.completedAt ?? nowIso()) : null;
      if (patch.assigneeUserId) t.assigneeFreelancerId = null;
      if (patch.assigneeFreelancerId) t.assigneeUserId = null;
      touch(t);
      if (patch.statusKey && patch.statusKey !== before.statusKey) emit(db, me, { type: "task.status_changed", entityType: "task", entityId: t.id, project: p, data: { from: before.statusKey, to: patch.statusKey, title: t.title } });
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
  sprints: () => read((db) => db.sprints.filter((s) => !s.deletedAt).sort((a, b) => a.startAt.localeCompare(b.startAt))),

  createSprint: (input: { name: string; startAt: string; endAt: string }) =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      if (!input.name.trim()) throw new ApiError(422, "Dê um nome à sprint.", { name: "Dê um nome à sprint" });
      if (input.endAt < input.startAt) throw new ApiError(422, "A data final deve ser depois da inicial.", { endAt: "A data final deve ser depois da inicial" });
      const s = { ...baseFields(me.id), name: input.name.trim(), startAt: input.startAt, endAt: input.endAt, status: "planejada" as const };
      db.sprints.push(s);
      return s;
    }),

  setSprintStatus: (id: ID, status: "planejada" | "ativa" | "concluida") =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      const s = db.sprints.find((x) => x.id === id);
      if (!s) throw new ApiError(404, "Sprint não encontrada.");
      if (status === "ativa") db.sprints.filter((x) => x.status === "ativa").forEach((x) => (x.status = "concluida"));
      s.status = status;
      touch(s);
      return s;
    }),
};
