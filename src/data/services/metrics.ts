/** Indicadores (seção 12) — determinísticos, derivados dos relacionamentos e do event log. */
import { FIRST_PROJECT_STAGE, PROJECT_STAGES } from "../reference";
import type { ID } from "../types";
import { ApiError, freelancerIdOf, read, visibleProjects } from "./_core";
import { computeFinancials } from "./projects";
import { access, canSeeMoney } from "@/lib/permissions";

const DAY = 86_400_000;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY;

export interface MetricsFilter {
  from?: string;
  to?: string;
  projectTypeId?: ID;
  ownerId?: ID;
}

export const metricsApi = {
  /** RF-M8-01 — painel da gestão. */
  dashboard: () =>
    read((db, me) => {
      const projects = visibleProjects(db, me);
      const now = Date.now();
      const week = now + 7 * DAY;
      const thisMonth = new Date().toISOString().slice(0, 7);
      const active = projects.filter((p) => p.status === "ativo");
      const money = canSeeMoney(me) && access(me, "receivables") === "T";
      return {
        byStage: PROJECT_STAGES.filter((s) => s.key !== "concluido").map((s) => ({ key: s.key, label: s.label, category: s.category, count: active.filter((p) => p.projectStageKey === s.key).length })),
        overdueProjects: active.filter((p) => p.dueAt && new Date(p.dueAt).getTime() < now).map((p) => ({ id: p.id, code: p.code, title: p.title, dueAt: p.dueAt!, clientName: db.clients.find((c) => c.id === p.clientId)?.tradeName ?? "" })),
        dueThisWeek: active.filter((p) => p.dueAt && new Date(p.dueAt).getTime() >= now && new Date(p.dueAt).getTime() <= week).map((p) => ({ id: p.id, code: p.code, title: p.title, dueAt: p.dueAt!, stageKey: p.projectStageKey, clientName: db.clients.find((c) => c.id === p.clientId)?.tradeName ?? "" })),
        openQuotes: projects.filter((p) => p.status === "cotacao").length,
        openQuotesValue: money ? db.proposals.filter((pr) => pr.status === "enviada" && projects.some((p) => p.id === pr.projectId && p.status === "cotacao")).reduce((a, pr) => a + pr.amountCents, 0) : null,
        activeCount: active.length,
        overdueTasks: db.tasks.filter((t) => !t.deletedAt && t.statusKey !== "concluida" && t.dueAt && new Date(t.dueAt).getTime() < now && (!t.projectId || projects.some((p) => p.id === t.projectId))).length,
        receivableMonth: money ? db.receivables.filter((r) => !r.deletedAt && r.status !== "cancelado" && r.status !== "recebido" && r.expectedAt.slice(0, 7) === thisMonth).reduce((a, r) => a + r.amountCents, 0) : null,
        payableMonth: money ? db.payables.filter((p) => !p.deletedAt && p.status !== "pago" && p.dueAt.slice(0, 7) === thisMonth).reduce((a, p) => a + (p.invoicedAmountCents ?? p.agreedAmountCents), 0) : null,
        mailQueueWarning: false,
      };
    }),

  /** "Visão geral da empresa" (quadro atual da Draw): casos · projetos internos · pendências por área. */
  companyOverview: () =>
    read((db, me) => {
      if (access(me, "adm") === "-") throw new ApiError(403, "Seu perfil não tem acesso à visão geral da empresa.");
      const projects = visibleProjects(db, me);
      const adm = db.tasks.filter((t) => !t.deletedAt && t.module === "adm" && !t.parentTaskId);
      const open = adm.filter((t) => t.statusKey !== "concluida");
      const areas = (["administrativo", "comercial_marketing", "projetos_internos", "financeiro", "outros"] as const).map((key) => ({ key, open: open.filter((t) => (t.area ?? "outros") === key).length }));
      return {
        cases: projects.filter((p) => p.status === "ativo" || p.status === "cotacao").length,
        paused: projects.filter((p) => p.status === "ativo" && p.pausedAt).length,
        internalProjects: open.filter((t) => t.area === "projetos_internos").length,
        pending: open.length,
        areas,
      };
    }),

  /** RF-M8-03 — indicadores com período. */
  indicators: (f: MetricsFilter = {}) =>
    read((db, me) => {
      if (access(me, "metrics") === "-") throw new ApiError(403, "Seu perfil não tem acesso a indicadores.");
      const money = canSeeMoney(me);
      const from = f.from ? new Date(f.from).getTime() : 0;
      const to = f.to ? new Date(f.to).getTime() : Date.now() + 365 * DAY;
      const inRange = (iso: string | null) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() <= to;
      const all = db.projects.filter((p) => !p.deletedAt && (!f.projectTypeId || p.projectTypeId === f.projectTypeId) && (!f.ownerId || p.ownerId === f.ownerId));
      const sent = all.filter((p) => inRange(p.quoteSentAt));
      const approved = sent.filter((p) => p.approvedAt);
      const completed = all.filter((p) => inRange(p.completedAt));
      const entered = all.filter((p) => inRange(p.enteredAt));
      const typeName = (id: ID) => db.projectTypes.find((t) => t.id === id)?.name ?? "—";
      const userName = (id: ID) => db.users.find((u) => u.id === id)?.name ?? "—";

      const groupRate = (keyOf: (p: (typeof all)[number]) => string, label: (k: string) => string) => {
        const m = new Map<string, { sent: number; approved: number }>();
        sent.forEach((p) => {
          const k = keyOf(p);
          const row = m.get(k) ?? { sent: 0, approved: 0 };
          row.sent++;
          if (p.approvedAt) row.approved++;
          m.set(k, row);
        });
        return [...m.entries()].map(([k, v]) => ({ key: k, label: label(k), ...v, rate: v.sent ? v.approved / v.sent : 0 })).sort((a, b) => b.sent - a.sent);
      };

      // tempo por etapa (gargalo) a partir dos eventos project.stage_changed
      const stageDurations = new Map<string, number[]>();
      for (const p of all) {
        const evs = db.events.filter((e) => e.projectId === p.id && e.type === "project.stage_changed").sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
        let prevAt = p.startedAt ?? p.approvedAt;
        let prevKey: string | null = FIRST_PROJECT_STAGE;
        for (const e of evs) {
          if (prevAt && prevKey) {
            const arr = stageDurations.get(prevKey) ?? [];
            arr.push(Math.max(0, days(prevAt, e.occurredAt)));
            stageDurations.set(prevKey, arr);
          }
          prevAt = e.occurredAt;
          prevKey = (e.data.to as string) ?? null;
        }
      }

      // vazão por mês (12 meses)
      const now = new Date();
      const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1)).toISOString().slice(0, 7));
      const fin = money ? all.filter((p) => p.contractedAmountCents).map((p) => ({ p, f: computeFinancials(db, p.id) })) : [];
      const recs = money ? db.receivables.filter((r) => !r.deletedAt && r.status !== "cancelado") : [];

      const onTime = completed.filter((p) => p.estimatedEndAt && p.completedAt && new Date(p.completedAt) <= new Date(new Date(p.estimatedEndAt).getTime() + DAY));
      const openTasks = db.tasks.filter((t) => !t.deletedAt && t.statusKey !== "concluida" && t.module === "projeto");
      const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now());

      const clientsProjects = new Map<string, number>();
      all.filter((p) => p.status !== "cotacao" && p.status !== "perdido").forEach((p) => clientsProjects.set(p.clientId, (clientsProjects.get(p.clientId) ?? 0) + 1));

      const cycleByType = new Map<string, number[]>();
      completed.forEach((p) => {
        if (!p.startedAt || !p.completedAt) return;
        const arr = cycleByType.get(p.projectTypeId) ?? [];
        arr.push(days(p.startedAt, p.completedAt));
        cycleByType.set(p.projectTypeId, arr);
      });

      return {
        commercial: {
          conversionDaysMedian: median(approved.filter((p) => p.quoteSentAt && p.approvedAt).map((p) => days(p.quoteSentAt!, p.approvedAt!))),
          conversionRate: sent.length ? approved.length / sent.length : null,
          sent: sent.length,
          approved: approved.length,
          byType: groupRate((p) => p.projectTypeId, typeName),
          byOwner: groupRate((p) => p.ownerId, userName),
          origin: { cotacao: entered.filter((p) => p.origin === "cotacao" && p.status !== "cotacao" && p.status !== "perdido").length, direto: entered.filter((p) => p.origin === "direto").length },
          lostReasons: Object.entries(all.filter((p) => p.status === "perdido" && p.lostReason).reduce<Record<string, number>>((a, p) => ({ ...a, [p.lostReason!]: (a[p.lostReason!] ?? 0) + 1 }), {})).map(([reason, count]) => ({ reason, count })),
        },
        operation: {
          cycleDaysMedian: median(completed.filter((p) => p.startedAt && p.completedAt).map((p) => days(p.startedAt!, p.completedAt!))),
          cycleByType: [...cycleByType.entries()].map(([k, v]) => ({ key: k, label: typeName(k), days: median(v) ?? 0, count: v.length })),
          onTimePct: completed.length ? onTime.length / completed.length : null,
          deviationDaysMedian: median(completed.filter((p) => p.estimatedEndAt && p.completedAt).map((p) => days(p.estimatedEndAt!, p.completedAt!))),
          stageTime: PROJECT_STAGES.filter((s) => s.key !== "concluido").map((s) => ({ key: s.key, label: s.label, days: median(stageDurations.get(s.key) ?? []) ?? 0, samples: (stageDurations.get(s.key) ?? []).length })),
          throughput: months.map((m) => ({ month: m, count: all.filter((p) => p.completedAt?.slice(0, 7) === m).length })),
          wip: PROJECT_STAGES.filter((s) => s.key !== "concluido").map((s) => ({ key: s.key, label: s.label, projects: all.filter((p) => p.status === "ativo" && p.projectStageKey === s.key).length, tasks: openTasks.filter((t) => t.stageKey === s.key).length })),
          overduePct: openTasks.length ? overdueTasks.length / openTasks.length : null,
          openTasks: openTasks.length,
        },
        finance: money
          ? {
              revenueByMonth: months.map((m) => ({
                month: m,
                contratado: all.filter((p) => p.approvedAt?.slice(0, 7) === m).reduce((a, p) => a + (p.contractedAmountCents ?? 0), 0),
                faturado: recs.filter((r) => r.issuedAt?.slice(0, 7) === m).reduce((a, r) => a + r.amountCents, 0),
                recebido: recs.filter((r) => r.receivedAt?.slice(0, 7) === m).reduce((a, r) => a + r.amountCents, 0),
              })),
              marginTotal: fin.reduce((a, x) => a + x.f.marginCents, 0),
              contractedTotal: fin.reduce((a, x) => a + x.f.contractedCents, 0),
              marginByType: Object.values(
                fin.reduce<Record<string, { label: string; contracted: number; margin: number; count: number }>>((acc, { p, f: fx }) => {
                  const k = p.projectTypeId;
                  acc[k] ??= { label: typeName(k), contracted: 0, margin: 0, count: 0 };
                  acc[k].contracted += fx.contractedCents;
                  acc[k].margin += fx.marginCents;
                  acc[k].count++;
                  return acc;
                }, {}),
              ).map((r) => ({ ...r, ticket: r.count ? r.contracted / r.count : 0, marginPct: r.contracted ? r.margin / r.contracted : 0 })),
              ticketByClient: Object.values(
                fin.reduce<Record<string, { label: string; contracted: number; count: number; margin: number }>>((acc, { p, f: fx }) => {
                  acc[p.clientId] ??= { label: db.clients.find((c) => c.id === p.clientId)?.tradeName ?? "—", contracted: 0, count: 0, margin: 0 };
                  acc[p.clientId].contracted += fx.contractedCents;
                  acc[p.clientId].margin += fx.marginCents;
                  acc[p.clientId].count++;
                  return acc;
                }, {}),
              ).map((r) => ({ ...r, ticket: r.contracted / r.count })).sort((a, b) => b.contracted - a.contracted).slice(0, 10),
              freelancerCost: Object.values(
                db.payables.filter((x) => x.kind === "freelancer" && !x.deletedAt).reduce<Record<string, { label: string; total: number; count: number }>>((acc, x) => {
                  acc[x.freelancerId!] ??= { label: db.freelancers.find((fl) => fl.id === x.freelancerId)?.name ?? "—", total: 0, count: 0 };
                  acc[x.freelancerId!].total += x.invoicedAmountCents ?? x.agreedAmountCents;
                  acc[x.freelancerId!].count++;
                  return acc;
                }, {}),
              ).sort((a, b) => b.total - a.total).slice(0, 10),
            }
          : null,
        clients: {
          recurring: [...clientsProjects.values()].filter((n) => n > 1).length,
          total: clientsProjects.size,
          projectsPerClient: clientsProjects.size ? [...clientsProjects.values()].reduce((a, b) => a + b, 0) / clientsProjects.size : 0,
        },
      };
    }),

  /** RF-M8-02 — atividade do time. */
  teamActivity: (daysBack = 14) =>
    read((db, me) => {
      if (access(me, "metrics") === "-") throw new ApiError(403, "Sem acesso.");
      const since = Date.now() - daysBack * DAY;
      const evs = db.events.filter((e) => e.actorId && new Date(e.occurredAt).getTime() >= since);
      return db.users
        .filter((u) => u.userType === "internal" && u.status === "ativo")
        .map((u) => {
          const mine = evs.filter((e) => e.actorId === u.id);
          return {
            userId: u.id,
            name: u.name,
            color: u.avatarColor,
            events: mine.length,
            tasksCompleted: db.tasks.filter((t) => t.assigneeUserId === u.id && t.completedAt && new Date(t.completedAt).getTime() >= since).length,
            comments: db.comments.filter((c) => c.authorId === u.id && new Date(c.createdAt).getTime() >= since).length,
            lastAt: mine.map((e) => e.occurredAt).sort().at(-1) ?? null,
          };
        })
        .sort((a, b) => b.events - a.events);
    }),

  /** RF-M8-04 — carga por pessoa e por freelancer. */
  workload: () =>
    read((db, me) => {
      if (access(me, "metrics") === "-" && me.role !== "gestao") throw new ApiError(403, "Sem acesso.");
      const week = Date.now() + 7 * DAY;
      const open = db.tasks.filter((t) => !t.deletedAt && t.statusKey !== "concluida");
      const row = (match: (t: (typeof open)[number]) => boolean) => {
        const mine = open.filter(match);
        return { open: mine.length, dueSoon: mine.filter((t) => t.dueAt && new Date(t.dueAt).getTime() <= week && new Date(t.dueAt).getTime() >= Date.now()).length, overdue: mine.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < Date.now()).length, estimateMinutes: mine.reduce((a, t) => a + (t.estimateMinutes ?? 0), 0) };
      };
      return [
        ...db.users.filter((u) => u.userType === "internal" && u.status === "ativo").map((u) => ({ kind: "interno" as const, id: u.id, name: u.name, color: u.avatarColor, projects: db.projectMembers.filter((m) => m.userId === u.id && m.active && db.projects.find((p) => p.id === m.projectId)?.status === "ativo").length, ...row((t) => t.assigneeUserId === u.id) })),
        ...db.freelancers.filter((f) => f.status === "ativo").map((f) => ({ kind: "freelancer" as const, id: f.id, name: f.name, color: f.avatarColor, projects: db.projectMembers.filter((m) => m.freelancerId === f.id && m.active && db.projects.find((p) => p.id === m.projectId)?.status === "ativo").length, ...row((t) => t.assigneeFreelancerId === f.id) })),
      ].sort((a, b) => b.open - a.open);
    }),

  /** RF-M8-05 — burndown por projeto. */
  burndown: (projectId: ID) =>
    read((db, me) => {
      const p = visibleProjects(db, me).find((x) => x.id === projectId || x.code === projectId);
      if (!p) throw new ApiError(404, "Projeto não encontrado.");
      const tasks = db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt);
      const start = new Date(p.startedAt ?? p.enteredAt).getTime();
      const end = Math.max(new Date(p.dueAt ?? Date.now()).getTime(), Date.now());
      const total = tasks.length;
      const points: { date: string; restantes: number | null; ideal: number }[] = [];
      const span = Math.max(1, Math.ceil((end - start) / DAY));
      const step = Math.max(1, Math.ceil(span / 30));
      const dueSpan = Math.max(1, (new Date(p.dueAt ?? end).getTime() - start) / DAY);
      for (let i = 0; i <= span; i += step) {
        const t = start + i * DAY;
        points.push({
          date: new Date(t).toISOString(),
          restantes: t <= Date.now() ? total - tasks.filter((x) => x.completedAt && new Date(x.completedAt).getTime() <= t).length : null,
          ideal: Math.max(0, Math.round(total - (total * i) / dueSpan)),
        });
      }
      return { total, done: tasks.filter((t) => t.statusKey === "concluida").length, points };
    }),

  /** Início do freelancer (RF-M9-01). */
  freelancerHome: () =>
    read((db, me) => {
      const flId = freelancerIdOf(db, me);
      const projects = visibleProjects(db, me).filter((p) => p.status === "ativo");
      return {
        projects: projects.length,
        openTasks: db.tasks.filter((t) => !t.deletedAt && t.assigneeFreelancerId === flId && t.statusKey !== "concluida").length,
        pendingInvoices: db.payables.filter((p) => p.freelancerId === flId && p.status === "aguardando_nf").map((p) => {
          const req = db.freelancerInvoiceRequests.find((r) => r.payableId === p.id);
          return { id: p.id, description: p.description, agreedAmountCents: p.agreedAmountCents, token: req ? db.shareLinks.find((s) => s.id === req.shareLinkId)?.token ?? null : null };
        }),
      };
    }),
};
