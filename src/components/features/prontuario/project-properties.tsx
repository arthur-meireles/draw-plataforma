"use client";
import Link from "next/link";
import { useState } from "react";
import { Avatar, Combobox, DateInput, Icon, Pill, PropertyRow, Section, IconButton, type Option } from "@/components/ui";
import { Money, PriorityPill, ProjectStageLabel, ProjectStatusBadge, ProjectTypeIcon, QuoteStageLabel, usePeopleOptions } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiQuery } from "@/data/hooks";
import { clientsApi } from "@/data/services";
import { cn } from "@/lib/cn";
import { dateFull, dateTime, formatCnpj, fromDateInput, toDateInput } from "@/lib/format";
import { useProjectUpdate, type ProjectDetail } from "./use-project";

const ORIGIN_LABEL = { cotacao: "Cotação aprovada", direto: "Projeto direto" } as const;

/** Coluna de propriedades do prontuário (PropertyRow). Edições vão por `projectsApi.update` (RN-12 em toast). */
export function ProjectProperties({ project, className }: { project: ProjectDetail; className?: string }) {
  const { canWrite, canWriteAll, money } = usePermissions();
  const update = useProjectUpdate(project.id);
  const people = usePeopleOptions({ internalOnly: true });
  const editable = canWrite("projects") && !["arquivado", "cancelado"].includes(project.status);
  const manage = canWriteAll("projects") && editable;
  const contacts = useApiQuery(["client-contacts", project.clientId], () => clientsApi.get(project.clientId), { enabled: manage, staleTime: 30_000 });
  const contactOptions: Option[] = (contacts.data?.contacts ?? []).map((c) => ({ value: c.id, label: c.name, description: c.email }));
  const [open, setOpen] = useState(false);

  const owner = project.owner;
  const ownerPill = (
    <Pill static={!manage} leading={owner ? <Avatar name={owner.name} color={owner.avatarColor} size="xs" /> : <Icon name="user" size="xs" />}>
      {owner?.name ?? "Sem responsável"}
    </Pill>
  );

  return (
    <Section
      title="Propriedades"
      icon="panelRight"
      className={className}
      actions={<IconButton className="xl:hidden" icon={open ? "chevronDown" : "chevronRight"} label={open ? "Recolher propriedades" : "Expandir propriedades"} aria-expanded={open} onClick={() => setOpen(!open)} />}
      bodyClassName={cn("space-y-0.5 p-3", open ? "block" : "max-xl:hidden")}
    >
      <PropertyRow label="Status" icon="stageOpen"><ProjectStatusBadge status={project.status} /></PropertyRow>
      <PropertyRow label="Etapa" icon="stageWaiting">{project.status === "cotacao" || project.status === "perdido" ? <QuoteStageLabel stageKey={project.quoteStageKey} /> : <ProjectStageLabel stageKey={project.projectStageKey} />}</PropertyRow>
      <PropertyRow label="Cliente" icon="client">
        <Link href={`/clientes/${project.clientId}`} className="truncate text-accent hover:underline">{project.client.tradeName}</Link>
      </PropertyRow>
      <PropertyRow label="Faturamento" icon="receivable">
        {manage && contactOptions.length ? (
          <Combobox
            options={contactOptions}
            value={project.billingContactId}
            onChange={(v) => v && v !== project.billingContactId && update.mutate({ billingContactId: v })}
            trigger={<Pill leading={<Icon name="user" size="xs" />}>{project.billingContact?.name ?? "Escolher contato"}</Pill>}
            contentClassName="w-64"
          />
        ) : project.billingContact ? (
          <span className="block truncate text-sm" title={project.billingContact.email}>{project.billingContact.name}</span>
        ) : (
          <span className="text-fg-subtle">Sem contato de faturamento</span>
        )}
      </PropertyRow>
      <PropertyRow label="CNPJ" icon="tag"><span className="tabular-nums text-fg-muted">{formatCnpj(project.client.cnpj)}</span></PropertyRow>
      <PropertyRow label="Tipo" icon="project"><span className="inline-flex items-center gap-1.5"><ProjectTypeIcon icon={project.typeIcon} size="xs" />{project.typeName}</span></PropertyRow>
      <PropertyRow label="Origem" icon="commercial"><span className="text-fg-muted">{ORIGIN_LABEL[project.origin]}</span></PropertyRow>
      <PropertyRow label="Responsável" icon="user">
        {manage ? <Combobox options={people.options} value={`user:${project.ownerId}`} onChange={(v) => v && v !== `user:${project.ownerId}` && update.mutate({ ownerId: v.split(":")[1] })} trigger={ownerPill} contentClassName="w-64" searchPlaceholder="Buscar pessoa…" /> : ownerPill}
      </PropertyRow>
      <PropertyRow label="Prioridade" icon="priority">
        <PriorityPill value={project.priorityKey} onChange={editable ? (v) => update.mutate({ priorityKey: v }) : undefined} />
      </PropertyRow>
      <PropertyRow label="Prazo" icon="due">
        {editable ? <DateInput aria-label="Prazo de entrega" value={toDateInput(project.dueAt)} onChange={(e) => update.mutate({ dueAt: fromDateInput(e.target.value) })} className="h-7" /> : <span className="text-fg-muted">{dateFull(project.dueAt)}</span>}
      </PropertyRow>
      <PropertyRow label="Previsão de término" icon="date">
        {editable ? <DateInput aria-label="Estimativa de término" value={toDateInput(project.estimatedEndAt)} onChange={(e) => update.mutate({ estimatedEndAt: fromDateInput(e.target.value) })} className="h-7" /> : <span className="text-fg-muted">{dateFull(project.estimatedEndAt)}</span>}
      </PropertyRow>
      {(money || project.contractedAmountCents != null) && (
        <PropertyRow label="Valor contratado" icon="money"><Money cents={project.contractedAmountCents} className="font-medium" /></PropertyRow>
      )}
      <PropertyRow label="Entrada" icon="date"><span className="text-fg-muted">{dateFull(project.enteredAt)}</span></PropertyRow>
      {project.quoteSentAt && <PropertyRow label="Proposta enviada" icon="send"><span className="text-fg-muted">{dateFull(project.quoteSentAt)}</span></PropertyRow>}
      {project.approvedAt && <PropertyRow label="Aprovação" icon="approval"><span className="text-fg-muted">{dateFull(project.approvedAt)}</span></PropertyRow>}
      {project.startedAt && <PropertyRow label="Início" icon="time"><span className="text-fg-muted">{dateFull(project.startedAt)}</span></PropertyRow>}
      {project.completedAt && <PropertyRow label="Conclusão" icon="stageDone"><span className="text-fg-muted">{dateFull(project.completedAt)}</span></PropertyRow>}
      <p className="border-t border-line pt-2.5 text-2xs text-fg-subtle">
        Criado em {dateTime(project.createdAt)}
        <br />
        Atualizado em {dateTime(project.updatedAt)}
      </p>
    </Section>
  );
}
