"use client";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyState, ErrorState, Progress, Section, Skeleton, TextareaField } from "@/components/ui";
import { ApprovalBadge, ClientLinksSection, EventTimeline, LineSeriesChart, Proposals } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiQuery } from "@/data/hooks";
import { approvalsApi, metricsApi, type ClientLinkPurpose } from "@/data/services";
import { projectStage } from "@/data/reference";
import { dateFull, plural, relative } from "@/lib/format";
import { DeliveryInsights } from "./delivery-insights";
import { KeyDates } from "./key-dates";
import { StageStepper } from "./stage-stepper";
import { useCanEditProject, useProjectUpdate, type ProjectDetail } from "./use-project";

const PROPOSAL_LINKS = ["proposta"] as const satisfies ClientLinkPurpose[];

function Briefing({ project, editable }: { project: ProjectDetail; editable: boolean }) {
  const update = useProjectUpdate(project.id);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.briefing ?? "");
  useEffect(() => setText(project.briefing ?? ""), [project.briefing]);
  return (
    <Section
      title="Briefing"
      icon="document"
      actions={editable && !editing && <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(true)}>Editar</Button>}
    >
      {editing ? (
        <div className="space-y-3">
          <TextareaField autoFocus aria-label="Briefing do projeto" value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Descreva o escopo, o público e o que o cliente espera receber." onSubmitShortcut={() => update.mutate({ briefing: text.trim() || null }, { onSuccess: () => setEditing(false) })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setText(project.briefing ?? ""); setEditing(false); }}>Cancelar</Button>
            <Button variant="primary" loading={update.isPending} onClick={() => update.mutate({ briefing: text.trim() || null }, { onSuccess: () => setEditing(false) })}>Salvar briefing</Button>
          </div>
        </div>
      ) : project.briefing ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-muted">{project.briefing}</p>
      ) : (
        <EmptyState compact icon="document" title="Sem briefing" description="Registre o escopo para a equipe e os freelancers entenderem o projeto." action={editable ? { label: "Escrever briefing", icon: "edit", onClick: () => setEditing(true) } : undefined} />
      )}
    </Section>
  );
}

function PendingApprovals({ project, onSeeAll }: { project: ProjectDetail; onSeeAll: () => void }) {
  const q = useApiQuery(["approvals", project.id], () => approvalsApi.list(project.id));
  const pending = q.data?.filter((a) => a.decision === "pendente") ?? [];
  return (
    <Section title="Aprovações pendentes" icon="approval" actions={<Button size="sm" variant="ghost" onClick={onSeeAll}>Ver aprovações</Button>} bodyClassName="p-0">
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="p-4"><Skeleton className="h-10" /></div>
      ) : !pending.length ? (
        <p className="px-4 py-4 text-sm text-fg-subtle">Nenhuma aprovação pendente.</p>
      ) : (
        <ul className="divide-y divide-line">
          {pending.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <span className="font-medium text-fg">{projectStage(a.stageKey)?.label}</span>
              <span className="text-xs text-fg-subtle">de {a.requestedFrom} · {relative(a.createdAt)}</span>
              <span className="flex-1" />
              <ApprovalBadge decision={a.decision} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Burndown({ project }: { project: ProjectDetail }) {
  const q = useApiQuery(["burndown", project.id], () => metricsApi.burndown(project.id));
  return (
    <Section title="Burndown de tarefas" icon="chart" description={q.data ? `${q.data.done} de ${q.data.total} tarefas concluídas` : undefined}>
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-56" />
      ) : !q.data?.total ? (
        <EmptyState compact icon="chart" title="Sem tarefas para medir" description="Crie tarefas na aba Tarefas para acompanhar o ritmo de entrega." />
      ) : (
        <LineSeriesChart data={q.data.points} xKey="date" xFormat={(d) => dateFull(d).slice(0, 5)} series={[{ key: "ideal", label: "Ideal", dashed: true }, { key: "restantes", label: "Restantes" }]} />
      )}
    </Section>
  );
}

/** Aba "Visão geral": briefing, datas, etapas, progresso, aprovações, atividade e burndown. */
export function ProjectOverview({ project, onTab, proposalOpen, onProposalOpen }: { project: ProjectDetail; onTab: (tab: string) => void; proposalOpen: boolean; onProposalOpen: (open: boolean) => void }) {
  const { money, isFreelancer } = usePermissions();
  const editable = useCanEditProject(project);
  const pct = project.subtasksTotal ? Math.round((project.subtasksDone / project.subtasksTotal) * 100) : 0;
  const showProposals = money && !isFreelancer && (project.status === "cotacao" || project.origin === "cotacao" || project.status === "perdido");

  return (
    <div className="space-y-4">
      <Section title="Andamento" icon="target" bodyClassName="space-y-5">
        <StageStepper project={project} />
        <KeyDates project={project} />
        <div className="space-y-1.5 border-t border-line pt-4">
          <div className="flex items-center justify-between text-xs text-fg-subtle">
            <span>Progresso das tarefas</span>
            <span className="tabular-nums text-fg-muted">{project.subtasksTotal ? `${project.subtasksDone}/${project.subtasksTotal} · ${pct}%` : "Sem tarefas"}</span>
          </div>
          <Progress value={project.subtasksDone} max={Math.max(1, project.subtasksTotal)} tone={project.isOverdue ? "danger" : pct === 100 ? "success" : "accent"} label="Progresso das tarefas" />
          {project.tasksOpen > 0 && <p className="text-xs text-fg-subtle">{plural(project.tasksOpen, "tarefa aberta", "tarefas abertas")}{project.isOverdue ? <Badge tone="danger" size="xs" className="ml-2">Projeto atrasado</Badge> : null}</p>}
        </div>
      </Section>

      {showProposals && <Proposals projectId={project.id} projectStatus={project.status} newOpen={proposalOpen} onNewOpenChange={onProposalOpen} />}
      {showProposals && <ClientLinksSection projectId={project.id} purposes={PROPOSAL_LINKS} title="Propostas enviadas ao cliente" description="Links de proposta enviados por e-mail. O cliente aprova ou pede ajustes pela página do link." />}

      <Briefing project={project} editable={editable} />

      <div className="grid gap-4 lg:grid-cols-2">
        <PendingApprovals project={project} onSeeAll={() => onTab("aprovacoes")} />
        <Section title="Atividade recente" icon="history" actions={<Button size="sm" variant="ghost" onClick={() => onTab("historico")}>Ver histórico</Button>}>
          <EventTimeline projectId={project.id} limit={6} compact />
        </Section>
      </div>

      {project.status === "ativo" && <Burndown project={project} />}
      {project.status !== "cotacao" && project.status !== "perdido" && <DeliveryInsights projectId={project.id} editable={project.status !== "arquivado"} />}
    </div>
  );
}
