/**
 * Rotinas agendadas (RN-34). No back-end real, um job diário (cron às 7h de São Paulo) chama a mesma
 * regra; aqui o chassi do app roda `jobsApi.runDueSweep()` ao abrir e a cada 30 minutos. A rotina é
 * determinística e idempotente: cada marco gera no máximo um aviso por pessoa (tabela `dueAlerts`).
 *
 * O que ela gera (sempre na Caixa de entrada de quem está envolvido — nunca um "feed de tudo"):
 *  - Tarefa (projeto ou Administrativo) a até `dueSoonDays` do prazo → "prazo" ao responsável; vencida → "atraso".
 *  - Projeto ativo (não parado) perto do prazo / vencido → "prazo" / "atraso" ao responsável do projeto.
 *  - Documento institucional: D-30, D-7 e vencido → "prazo" / "atraso" a quem gerencia o Administrativo (admin, gestão).
 *  - Recebíveis e NF de freelancer: ver `finance-routines.ts` (RN-46), chamada junto pelo chassi.
 */
import { baseFields, nowIso, transaction } from "../db";
import type { Database, ID, NotificationType, Project, Task, User } from "../types";
import { actor, latency, notify } from "./_core";
import { freelancerUserId } from "./audience";
import { canWriteAll } from "@/lib/permissions";
import { toDateInput } from "@/lib/format";

const DAY = 86_400_000;

/** Dias inteiros (no fuso de São Paulo) entre `now` e a data. Negativo = já passou. */
function daysBetween(now: Date, iso: string): number {
  const a = Date.parse(toDateInput(now.toISOString()));
  const b = Date.parse(toDateInput(iso));
  return Math.round((b - a) / DAY);
}

const alertsOf = (db: Database) => (db.dueAlerts ??= []);

const activeUser = (db: Database, id: ID | null | undefined): User | null =>
  (id && db.users.find((u) => u.id === id && u.status === "ativo" && !u.deletedAt)) || null;

const dayText = (d: number) => (d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`);
const lateText = (d: number) => (d === -1 ? "1 dia" : `${-d} dias`);

/** Projeto que ainda corre prazo: ativo, não parado, não excluído. */
const runningProject = (p: Project | null | undefined) => !!p && !p.deletedAt && p.status === "ativo" && !p.pausedAt;

export interface SweepResult {
  created: number;
}

/** RN-34 — varre prazos e gera os avisos que ainda não existem. Pura sobre o banco: os testes passam `now`. */
export function runDueSweepTx(db: Database, now: Date = new Date()): SweepResult {
  const settings = db.organizations[0]?.settings;
  const soon = settings?.dueSoonDays ?? 2;
  const seen = new Set(alertsOf(db).map((a) => a.key));
  let created = 0;

  const emit = (key: string, userId: ID | null | undefined, n: { type: NotificationType; title: string; body?: string; project?: Project | null; entityType: string; entityId: ID }) => {
    if (!activeUser(db, userId)) return;
    const k = `${key}:${userId}`;
    if (seen.has(k)) return;
    seen.add(k);
    alertsOf(db).push({ ...baseFields(null), key: k, sentAt: nowIso() });
    const before = db.notifications.length;
    notify(db, null, { ...n, userId });
    if (db.notifications.length > before) created++;
  };

  /* tarefas */
  const taskOwner = (t: Task) => t.assigneeUserId ?? freelancerUserId(db, t.assigneeFreelancerId);
  for (const t of db.tasks) {
    if (t.deletedAt || !t.dueAt || t.statusKey === "concluida") continue;
    const p = t.projectId ? db.projects.find((x) => x.id === t.projectId) : null;
    if (t.projectId && !runningProject(p)) continue;
    const d = daysBetween(now, t.dueAt);
    const who = taskOwner(t);
    const target = { project: p ?? null, entityType: "task", entityId: t.id };
    if (d < 0) emit(`atraso:task:${t.id}:${t.dueAt}`, who, { type: "atraso", title: `Tarefa atrasada: ${t.title}`, body: `Venceu há ${lateText(d)}`, ...target });
    else if (d <= soon) emit(`prazo:task:${t.id}:${t.dueAt}`, who, { type: "prazo", title: `Prazo ${dayText(d)}: ${t.title}`, body: `A tarefa vence ${dayText(d)}`, ...target });
  }

  /* projetos */
  for (const p of db.projects) {
    if (!runningProject(p) || !p.dueAt) continue;
    const d = daysBetween(now, p.dueAt);
    const target = { project: p, entityType: "project", entityId: p.id };
    if (d < 0) emit(`atraso:project:${p.id}:${p.dueAt}`, p.ownerId, { type: "atraso", title: "Projeto com prazo vencido", body: `Prazo de entrega passou há ${lateText(d)}`, ...target });
    else if (d <= soon) emit(`prazo:project:${p.id}:${p.dueAt}`, p.ownerId, { type: "prazo", title: `Entrega do projeto ${dayText(d)}`, body: `${p.title} — prazo de entrega ${dayText(d)}`, ...target });
  }

  /* documentos institucionais (D-30, D-7, vencido) */
  const admManagers = db.users.filter((u) => u.status === "ativo" && !u.deletedAt && canWriteAll(u, "adm")).map((u) => u.id);
  for (const doc of db.institutionalDocuments) {
    if (doc.deletedAt || !doc.validUntil) continue;
    const d = daysBetween(now, doc.validUntil);
    const milestone = d < 0 ? "vencido" : d <= 7 ? "d7" : d <= 30 ? "d30" : null;
    if (!milestone) continue;
    const n =
      milestone === "vencido"
        ? { type: "atraso" as const, title: `Documento vencido: ${doc.title}`, body: `Venceu há ${lateText(d)}. Renove e envie a nova versão em Administrativo › Documentos.` }
        : { type: "prazo" as const, title: `Documento vence ${dayText(d)}: ${doc.title}`, body: "Providencie a renovação e envie a nova versão em Administrativo › Documentos." };
    admManagers.forEach((uid) => emit(`doc:${doc.id}:${doc.validUntil}:${milestone}`, uid, { ...n, entityType: "document", entityId: doc.id }));
  }

  /* recebíveis vencidos/a vencer ficam com a rotina do Financeiro (RN-46, `routinesApi.runDaily`), que avisa só o Financeiro envolvido */

  return { created };
}

export const jobsApi = {
  /**
   * RN-34 — `POST /api/v1/jobs/due-sweep` (interno; no back-end roda por agendamento, não pelo navegador).
   * Exige sessão; o aviso é do sistema (sem autor). Só grava quando há aviso novo.
   */
  runDueSweep: async (now?: Date): Promise<SweepResult> => {
    await latency(40);
    actor();
    return transaction((db) => runDueSweepTx(db, now));
  },
};
