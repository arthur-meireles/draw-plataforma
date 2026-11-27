/**
 * RN-74 — a decisão de aprovação do cliente (interna ou pelo link) move o projeto pelo quadro "1. Casos" (seção 20.1):
 * aprovado avança para a próxima etapa de trabalho; ajustes volta para a etapa de ajustes correspondente.
 * Só move se o projeto está ativo, não pausado e ainda na etapa da aprovação. Validação aprovada não conclui
 * sozinha (a conclusão decide pagamentos — RN-40): avisa o responsável que o projeto está pronto para concluir.
 */
import { baseFields } from "../db";
import { PROJECT_STAGES } from "../reference";
import type { Approval, ApprovalDecision, Database, Project, ProjectStageKey, User } from "../types";
import { emit, notify, touch } from "./_core";
import { notifyMany, projectAudience } from "./audience";

const ON_APPROVED: Partial<Record<ProjectStageKey, ProjectStageKey>> = {
  roteiro: "design",
  ajustes_roteiro: "design",
  design: "validacao_cliente",
  ajustes_design: "validacao_cliente",
};

const ON_ADJUSTMENTS: Partial<Record<ProjectStageKey, ProjectStageKey>> = {
  roteiro: "ajustes_roteiro",
  ajustes_roteiro: "ajustes_roteiro",
  design: "ajustes_design",
  ajustes_design: "ajustes_design",
  validacao_cliente: "ajustes_design",
};

export function nextStageAfterDecision(stage: ProjectStageKey, decision: Exclude<ApprovalDecision, "pendente">): ProjectStageKey | null {
  if (decision === "aprovado") return ON_APPROVED[stage] ?? null;
  if (decision === "ajustes") return ON_ADJUSTMENTS[stage] ?? null;
  return null;
}

/** Aplica a transição; devolve a etapa nova (ou null quando nada mudou). */
export function applyDecisionToStage(db: Database, me: User | null, p: Project, a: Approval): ProjectStageKey | null {
  if (p.status !== "ativo" || p.pausedAt || p.projectStageKey !== a.stageKey || a.decision === "pendente") return null;
  if (a.decision === "aprovado" && a.stageKey === "validacao_cliente") {
    notify(db, me, { userId: p.ownerId, type: "aprovacao", title: "Cliente validou — projeto pronto para concluir", body: "Use \"Concluir projeto…\" para gerar os pagamentos", project: p });
    return null;
  }
  const to = nextStageAfterDecision(a.stageKey, a.decision);
  if (!to || to === p.projectStageKey) return null;
  emit(db, me, { type: "project.stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.projectStageKey, to, via: "aprovacao", approvalId: a.id } });
  p.projectStageKey = to;
  touch(p);
  const stage = PROJECT_STAGES.find((s) => s.key === to);
  if (stage?.category === "waiting" && !db.approvals.some((x) => x.projectId === p.id && x.stageKey === to && x.decision === "pendente" && !x.deletedAt)) {
    db.approvals.push({ ...baseFields(me?.id ?? null), projectId: p.id, stageKey: to, requestedFrom: db.clientContacts.find((c) => c.id === p.billingContactId)?.name ?? "Cliente", decision: "pendente", reason: null, decidedBy: null, decidedAt: null, requestedBy: me?.id ?? a.requestedBy, shareLinkId: null, decidedVia: null, decidedByName: null });
  }
  notifyMany(db, me, projectAudience(db, p), { type: "etapa", title: `Projeto movido para ${stage?.label}`, body: a.decision === "aprovado" ? "Etapa aprovada pelo cliente" : "Cliente pediu ajustes", project: p });
  return to;
}
