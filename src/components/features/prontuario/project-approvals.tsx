"use client";
import { useState } from "react";
import { Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Icon, SelectField, Skeleton, TextField } from "@/components/ui";
import { ApprovalBadge, projectStageOptions } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { approvalsApi } from "@/data/services";
import { projectStage } from "@/data/reference";
import type { ID, ProjectStageKey } from "@/data/types";
import { dateTime, relative } from "@/lib/format";
import type { ProjectDetail } from "./use-project";

type Approval = Awaited<ReturnType<typeof approvalsApi.list>>[number];

function RequestDialog({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const [stage, setStage] = useState<ProjectStageKey>(project.projectStageKey && project.projectStageKey !== "concluido" ? project.projectStageKey : "validacao_cliente");
  const [from, setFrom] = useState(project.billingContact?.name ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const request = useApiMutation(() => approvalsApi.request(project.id, { stageKey: stage, requestedFrom: from }), {
    success: "Pedido de aprovação registrado",
    onSuccess: onClose,
    onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Pedir aprovação"
      description="Registra que uma etapa aguarda a decisão do cliente. Para enviar o material por e-mail, use a aba E-mails."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={request.isPending} onClick={() => request.mutate(undefined)}>Pedir aprovação</Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField label="Etapa a aprovar" options={projectStageOptions(["concluido"])} value={stage} onChange={(v) => v && setStage(v)} />
        <TextField label="Quem aprova" required value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Nome do contato no cliente" error={errors.requestedFrom} />
      </div>
    </Dialog>
  );
}

/** Aba "Aprovações": pedidos por etapa e decisão (ajustes e negado exigem motivo, RF-M4-10). */
export function ProjectApprovals({ project }: { project: ProjectDetail }) {
  const { isFreelancer, canWrite } = usePermissions();
  const q = useApiQuery(["approvals", project.id], () => approvalsApi.list(project.id));
  const [requesting, setRequesting] = useState(false);
  const [deciding, setDeciding] = useState<{ approval: Approval; decision: "ajustes" | "negado" } | null>(null);
  const decide = useApiMutation(({ id, decision, reason }: { id: ID; decision: "aprovado" | "ajustes" | "negado"; reason?: string }) => approvalsApi.decide(id, decision, reason), {
    success: (a) => (a.decision === "aprovado" ? "Aprovação registrada" : a.decision === "ajustes" ? "Pedido de ajustes registrado" : "Negativa registrada"),
    onSuccess: () => setDeciding(null),
  });
  const canDecide = !isFreelancer && canWrite("projects");
  const canRequest = canDecide && project.status === "ativo";

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <p className="text-xs text-fg-subtle">{q.data ? `${q.data.length} ${q.data.length === 1 ? "registro" : "registros"}` : ""}</p>
        {canRequest && <Button size="sm" variant="primary" icon="add" onClick={() => setRequesting(true)}>Pedir aprovação</Button>}
      </div>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-3 p-4"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : !q.data?.length ? (
        <EmptyState icon="approval" title="Nenhuma aprovação registrada" description="Quando uma etapa depender do cliente, registre o pedido aqui. Etapas de validação criam o pedido automaticamente." action={canRequest ? { label: "Pedir aprovação", icon: "add", onClick: () => setRequesting(true) } : undefined} />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((a) => (
            <li key={a.id} className="space-y-2 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-fg">{projectStage(a.stageKey)?.label ?? a.stageKey}</span>
                <ApprovalBadge decision={a.decision} />
                <span className="text-xs text-fg-subtle">Pedida a {a.requestedFrom} · {relative(a.createdAt)}</span>
              </div>
              {a.decision !== "pendente" && (
                <p className="flex items-start gap-1.5 text-xs text-fg-muted">
                  <Icon name="history" size="xs" className="mt-0.5 shrink-0 text-fg-subtle" />
                  <span>
                    Decidida {a.decidedByName ? `por ${a.decidedByName} ` : ""}em {dateTime(a.decidedAt)}
                    {a.reason ? <> — “{a.reason}”</> : null}
                  </span>
                </p>
              )}
              {a.decision === "pendente" && canDecide && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" icon="check" loading={decide.isPending && decide.variables?.id === a.id && decide.variables.decision === "aprovado"} onClick={() => decide.mutate({ id: a.id, decision: "aprovado" })}>Registrar aprovação</Button>
                  <Button size="sm" onClick={() => setDeciding({ approval: a, decision: "ajustes" })}>Pedir ajustes…</Button>
                  <Button size="sm" variant="destructive-ghost" onClick={() => setDeciding({ approval: a, decision: "negado" })}>Registrar negativa…</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {requesting && <RequestDialog project={project} onClose={() => setRequesting(false)} />}
      <ConfirmDialog
        open={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        title={deciding?.decision === "ajustes" ? "Pedir ajustes?" : "Registrar negativa?"}
        description={deciding?.decision === "ajustes" ? "A equipe é avisada e vê o motivo no histórico." : "A equipe é avisada e vê o motivo no histórico. A etapa não avança."}
        confirmLabel={deciding?.decision === "ajustes" ? "Pedir ajustes" : "Registrar negativa"}
        destructive={deciding?.decision === "negado"}
        reason={{ label: deciding?.decision === "ajustes" ? "O que precisa mudar" : "Motivo da negativa", placeholder: "Seja específico para a equipe agir", required: true }}
        loading={decide.isPending}
        onConfirm={(reason) => deciding && decide.mutate({ id: deciding.approval.id, decision: deciding.decision, reason })}
      />
    </div>
  );
}
