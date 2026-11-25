/**
 * Extensões da "API" para o prontuário do projeto: marcos e métricas de entrega (RF-M4-14),
 * proposta com anexo em uma chamada (RF-M3-04) e prévia da conclusão (RN-03). Mesmas convenções de `_core`.
 */
import { baseFields } from "../db";
import type { DeliverableMetricKey, ID, Milestone, ProjectDeliverableMetric } from "../types";
import { ApiError, assertProjectVisible, emit, read, touch, write } from "./_core";
import { filesApi } from "./collab";
import { proposalsApi, type InstallmentInput } from "./proposals";
import { canWriteAll } from "@/lib/permissions";

const canEditProject = (me: { role: string }) => canWriteAll(me as never, "projects") || me.role === "operacao";

/* ───────── Marcos e aprendizados (RF-M4-14) ───────── */
export const milestonesApi = {
  list: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      return db.milestones.filter((m) => m.projectId === p.id && !m.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
    }),

  create: (projectId: ID, input: { title: string; date: string; learning?: string | null }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      if (!canEditProject(me)) throw new ApiError(403, "Seu perfil não pode registrar marcos.");
      const errors: Record<string, string> = {};
      if (!input.title.trim()) errors.title = "Dê um nome ao marco";
      if (!input.date) errors.date = "Informe a data do marco";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const m: Milestone = { ...baseFields(me.id), projectId: p.id, title: input.title.trim(), date: input.date, learning: input.learning?.trim() || null };
      db.milestones.push(m);
      emit(db, me, { type: "project.milestone_added", entityType: "project", entityId: p.id, project: p, data: { title: m.title } });
      return m;
    }),

  remove: (id: ID) =>
    write((db, me) => {
      const m = db.milestones.find((x) => x.id === id && !x.deletedAt);
      if (!m) throw new ApiError(404, "Marco não encontrado.");
      assertProjectVisible(db, me, m.projectId);
      if (!canEditProject(me)) throw new ApiError(403, "Seu perfil não pode remover marcos.");
      m.deletedAt = new Date().toISOString();
    }),
};

/* ───────── Métricas de entrega (RF-M4-14) ───────── */
export type DeliverableMetrics = Partial<Record<DeliverableMetricKey, number>>;

export const deliverableMetricsApi = {
  get: (projectId: ID) =>
    read((db, me): DeliverableMetrics => {
      const p = assertProjectVisible(db, me, projectId);
      const out: DeliverableMetrics = {};
      db.projectDeliverableMetrics.filter((m) => m.projectId === p.id && !m.deletedAt).forEach((m) => (out[m.metric] = m.value));
      return out;
    }),

  save: (projectId: ID, values: Partial<Record<DeliverableMetricKey, number | null>>) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      if (!canEditProject(me)) throw new ApiError(403, "Seu perfil não pode editar métricas de entrega.");
      for (const [key, value] of Object.entries(values) as [DeliverableMetricKey, number | null][]) {
        if (value != null && (!Number.isFinite(value) || value < 0)) throw new ApiError(422, "Use apenas números positivos nas métricas.", { [key]: "Use um número positivo" });
        const row = db.projectDeliverableMetrics.find((m) => m.projectId === p.id && m.metric === key && !m.deletedAt);
        if (value == null) {
          if (row) row.deletedAt = new Date().toISOString();
        } else if (row) {
          row.value = value;
          touch(row);
        } else {
          const m: ProjectDeliverableMetric = { ...baseFields(me.id), projectId: p.id, metric: key, value };
          db.projectDeliverableMetrics.push(m);
        }
      }
      emit(db, me, { type: "project.metrics_updated", entityType: "project", entityId: p.id, project: p });
    }),
};

/* ───────── Proposta com anexo (RF-M3-04) ───────── */
export const proposalsExtraApi = {
  /** Cria nova versão ou edita rascunho; se houver PDF, envia como arquivo `proposta` antes. */
  save: async (
    projectId: ID,
    input: { proposalId?: ID | null; amountCents: number; paymentTermsNote?: string; installments: InstallmentInput[]; file?: File | null; keepFileId?: ID | null },
  ) => {
    let fileId = input.keepFileId ?? null;
    if (input.file) {
      const up = await filesApi.upload({ projectId, category: "proposta", file: input.file });
      fileId = up.fileId;
    }
    const body = { amountCents: input.amountCents, paymentTermsNote: input.paymentTermsNote, installments: input.installments, fileId };
    return input.proposalId ? proposalsApi.update(input.proposalId, body) : proposalsApi.create(projectId, body);
  },
};

/* ───────── Prévia da conclusão (RN-03) ───────── */
export const projectsExtraApi = {
  completionPreview: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      const members = db.projectMembers.filter((m) => m.projectId === p.id && m.active && m.freelancerId && !m.deletedAt);
      const already = (id: ID) => db.payables.some((pay) => pay.projectMemberId === id && !pay.deletedAt);
      return {
        openTasks: db.tasks.filter((t) => t.projectId === p.id && !t.deletedAt && t.statusKey !== "concluida").length,
        freelancersWithAmount: members.filter((m) => m.agreedAmountCents && !already(m.id)).length,
        freelancersWithoutAmount: members.filter((m) => !m.agreedAmountCents).map((m) => db.freelancers.find((f) => f.id === m.freelancerId)?.name ?? "—"),
      };
    }),
};
