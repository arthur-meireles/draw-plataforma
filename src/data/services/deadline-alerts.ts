/**
 * RF-M4-13 / RF-M10-01 — gerador dos avisos de prazo e atraso na Caixa de entrada (no back-end: job diário).
 * Aqui roda ao abrir a sessão; é idempotente: um aviso por pessoa, tipo, item e data de prazo.
 *  - `prazo`: vence em até 2 dias · `atraso`: venceu.
 *  - Projeto ativo e não pausado → responsável. Tarefa aberta → quem é responsável por ela (interno ou freelancer
 *    com acesso), fora de projetos pausados ou encerrados (RN-13 / RN-57).
 */
import { nowIso } from "../db";
import type { Database, ID, NotificationType, Project } from "../types";
import { notify, write } from "./_core";
import { freelancerUserId } from "./audience";

const SOON_MS = 2 * 86_400_000;
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

function kindOf(dueAt: string, now: number): NotificationType | null {
  const due = new Date(dueAt).getTime();
  if (due < now) return "atraso";
  if (due - now <= SOON_MS) return "prazo";
  return null;
}

/** Já existe aviso igual (mesma pessoa, tipo, item e prazo)? */
const already = (db: Database, userId: ID, type: NotificationType, entityId: ID, dueAt: string) =>
  db.notifications.some((n) => n.userId === userId && n.type === type && n.entityId === entityId && (n.body ?? "").includes(`Prazo: ${dayLabel(dueAt)}`));

export function generateDeadlineAlerts(db: Database, now = Date.now()): number {
  let created = 0;
  const push = (userId: ID | null | undefined, type: NotificationType, title: string, dueAt: string, project: Project | null, entityType: string, entityId: ID, label: string) => {
    if (!userId || !db.users.some((u) => u.id === userId && u.status === "ativo")) return;
    if (already(db, userId, type, entityId, dueAt)) return;
    const before = db.notifications.length;
    // o marcador "Prazo: dd/mm" fica no corpo (depois do código do projeto) e serve à deduplicação
    notify(db, null, { userId, type, title, body: `${label} · Prazo: ${dayLabel(dueAt)}`, project, entityType, entityId });
    if (db.notifications.length > before) created++;
  };
  for (const p of db.projects) {
    if (p.deletedAt || p.status !== "ativo" || p.pausedAt || !p.dueAt) continue;
    const type = kindOf(p.dueAt, now);
    if (type) push(p.ownerId, type, type === "atraso" ? "Projeto atrasado" : "Projeto vence em breve", p.dueAt, p, "project", p.id, p.title);
  }
  for (const t of db.tasks) {
    if (t.deletedAt || t.statusKey === "concluida" || !t.dueAt) continue;
    const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) ?? null : null;
    if (p && (p.deletedAt || p.pausedAt || !["ativo", "cotacao"].includes(p.status))) continue;
    const type = kindOf(t.dueAt, now);
    if (!type) continue;
    const userId = t.assigneeUserId ?? freelancerUserId(db, t.assigneeFreelancerId);
    push(userId, type, type === "atraso" ? `Tarefa atrasada: ${t.title}` : `Tarefa vence em breve: ${t.title}`, t.dueAt, p, "task", t.id, t.title);
  }
  return created;
}

export const deadlineAlertsApi = {
  /** Varredura idempotente (no back-end: job diário). Devolve quantos avisos novos foram criados. */
  sweep: () => write((db) => ({ created: generateDeadlineAlerts(db), at: nowIso() }), 0),
};
