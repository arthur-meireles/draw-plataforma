/**
 * Núcleo da "API" local. Simula o contrato REST (/api/v1) para que a troca pelo back-end
 * real (ADR-001) aconteça só nesta pasta, sem tocar em telas.
 */
import { baseFields, loadDb, nowIso, transaction } from "../db";
import type { Database, DomainEvent, ID, Notification, NotificationType, Project, User } from "../types";
import { canSeeMoney, isScopedToMembership } from "@/lib/permissions";

export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

const SESSION_KEY = "draw:session";

export function getSessionUserId(): ID | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setSessionUserId(id: ID | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(SESSION_KEY, id);
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Usuário autenticado (lança 401 se não houver). */
export function actor(db: Database = loadDb()): User {
  const id = getSessionUserId();
  const u = id ? db.users.find((x) => x.id === id && x.status === "ativo") : undefined;
  if (!u) throw new ApiError(401, "Sessão expirada. Entre novamente.");
  return u;
}

/** Latência simulada de rede para exercitar estados de carregamento. */
export const latency = (ms = 160) => new Promise((r) => setTimeout(r, ms + Math.random() * 120));

export async function read<T>(fn: (db: Database, me: User) => T, ms?: number): Promise<T> {
  await latency(ms);
  const db = loadDb();
  return structuredClone(fn(db, actor(db)));
}

export async function write<T>(fn: (db: Database, me: User) => T, ms = 220): Promise<T> {
  await latency(ms);
  return structuredClone(transaction((db) => fn(db, actor(db))));
}

/* ───────── escopo e redação de campos (RF-M1-05) ───────── */

export function memberProjectIds(db: Database, me: User): Set<ID> {
  const flId = db.freelancers.find((f) => f.userId === me.id)?.id;
  return new Set(
    db.projectMembers
      .filter((m) => m.active && !m.deletedAt && (m.userId === me.id || (flId && m.freelancerId === flId)))
      .map((m) => m.projectId),
  );
}

export function freelancerIdOf(db: Database, me: User): ID | null {
  return db.freelancers.find((f) => f.userId === me.id)?.id ?? null;
}

export function visibleProjects(db: Database, me: User): Project[] {
  const rows = db.projects.filter((p) => !p.deletedAt);
  if (!isScopedToMembership(me)) return rows;
  const ids = memberProjectIds(db, me);
  return rows.filter((p) => ids.has(p.id) && (me.role !== "freelancer" || p.status !== "cotacao"));
}

/** Freelancer pedindo projeto em que não está → 404 (aceite do M1). */
export function assertProjectVisible(db: Database, me: User, projectId: ID): Project {
  const p = visibleProjects(db, me).find((x) => x.id === projectId || x.code === projectId);
  if (!p) throw new ApiError(404, "Projeto não encontrado.");
  return p;
}

export function redactProject<T extends Project>(p: T, me: User): T {
  if (canSeeMoney(me)) return p;
  return { ...p, contractedAmountCents: null };
}

/* ───────── eventos e notificações (P8) ───────── */

export function emit(
  db: Database,
  me: User | null,
  e: { type: string; entityType: string; entityId: ID; project?: Project | null; data?: Record<string, unknown> },
): DomainEvent {
  const at = nowIso();
  const event: DomainEvent = {
    ...baseFields(me?.id ?? null),
    entityType: e.entityType,
    entityId: e.entityId,
    projectId: e.project?.id ?? null,
    clientId: e.project?.clientId ?? null,
    actorId: me?.id ?? null,
    type: e.type,
    data: e.data ?? {},
    occurredAt: at,
  };
  db.events.push(event);
  return event;
}

export function notify(
  db: Database,
  me: User | null,
  n: { userId: ID | null | undefined; type: NotificationType; title: string; body?: string; project?: Project | null; entityType?: string; entityId?: ID },
) {
  if (!n.userId || n.userId === me?.id) return;
  const pref = db.notificationPreferences.find((p) => p.userId === n.userId && p.type === n.type && p.channel === "app");
  if (pref && !pref.enabled) return;
  const row: Notification = {
    ...baseFields(me?.id ?? null),
    userId: n.userId,
    type: n.type,
    projectId: n.project?.id ?? null,
    entityType: n.entityType ?? (n.project ? "project" : null),
    entityId: n.entityId ?? n.project?.id ?? null,
    title: n.title,
    body: n.project ? `${n.project.code} · ${n.body ?? n.project.title}` : (n.body ?? null),
    readAt: null,
  };
  db.notifications.push(row);
  const emailPref = db.notificationPreferences.find((p) => p.userId === n.userId && p.type === n.type && p.channel === "email");
  if (emailPref?.enabled) {
    const u = db.users.find((x) => x.id === n.userId);
    if (u) queueSystemEmail(db, { to: [u.email], subject: n.title, template: `notificacao_${n.type}`, projectId: n.project?.id ?? null });
  }
}

/** RNF-12 — e-mail do sistema entra na fila (Brevo principal, Resend reserva). */
export function queueSystemEmail(db: Database, e: { to: string[]; subject: string; template: string; projectId?: ID | null }) {
  const settings = db.systemMailSettings[0];
  db.emailLogs.push({
    ...baseFields(null),
    channel: "system",
    provider: settings?.transport === "draw_smtp" ? "draw_smtp" : "brevo",
    userId: null,
    projectId: e.projectId ?? null,
    to: e.to,
    cc: [],
    subject: e.subject,
    template: e.template,
    status: "sent",
    error: null,
    sentAt: nowIso(),
  });
}

/** Registra mudança de valor com antes/depois (RN-09). */
export function emitValueChange(db: Database, me: User, entityType: string, entityId: ID, project: Project | null, field: string, before: unknown, after: unknown) {
  if (before === after) return;
  emit(db, me, { type: `${entityType}.value_changed`, entityType, entityId, project, data: { field, before, after } });
}

export const touch = <T extends { updatedAt: string }>(row: T) => {
  row.updatedAt = nowIso();
  return row;
};
