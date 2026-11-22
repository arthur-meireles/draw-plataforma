"use client";
/** Tabela de freelancers (RF-M2-03): avatar+nome, especialidades, contato, carga, acesso e status. */
import { useRouter } from "next/navigation";
import { plural } from "@/lib/format";
import { Money } from "@/components/domain";
import { Avatar, Badge, Button, DataTable, RowActions, type Column } from "@/components/ui";
import { SpecialtyBadges } from "./specialty-badges";
import type { FreelancerRow } from "./use-freelancers";

export interface FreelancerTableProps {
  rows: FreelancerRow[] | undefined;
  isLoading?: boolean;
  error?: { message?: string; status?: number } | null;
  onRetry?: () => void;
  hasFilters: boolean;
  onClear: () => void;
  onCreate?: () => void;
  canWrite: boolean;
  canInvite: boolean;
  invitingId?: string | null;
  onEdit: (f: FreelancerRow) => void;
  onInvite: (f: FreelancerRow) => void;
  onToggleStatus: (f: FreelancerRow) => void;
}

export function FreelancerTable({ rows, isLoading, error, onRetry, hasFilters, onClear, onCreate, canWrite, canInvite, invitingId, onEdit, onInvite, onToggleStatus }: FreelancerTableProps) {
  const router = useRouter();
  const columns: Column<FreelancerRow>[] = [
    {
      id: "name",
      header: "Freelancer",
      mobile: "title",
      sortValue: (f) => f.name,
      cell: (f) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={f.name} color={f.avatarColor} size="md" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{f.name}</span>
            <span className="block truncate text-xs text-fg-subtle md:hidden">{f.email}</span>
          </span>
        </span>
      ),
    },
    { id: "spec", header: "Especialidades", mobile: "subtitle", cell: (f) => <SpecialtyBadges specialties={f.specialties} /> },
    {
      id: "contact",
      header: "Contato",
      hideBelow: "md",
      mobile: "hidden",
      cell: (f) => (
        <span className="block min-w-0">
          <span className="block max-w-56 truncate text-fg-muted">{f.email}</span>
          <span className="block text-xs text-fg-subtle">{f.phone ?? "—"}</span>
        </span>
      ),
    },
    { id: "projects", header: "Projetos ativos", align: "right", hideBelow: "lg", mobile: "meta", sortValue: (f) => f.activeProjects, cell: (f) => <span className="tabular-nums text-fg-muted">{plural(f.activeProjects, "ativo", "ativos")}</span> },
    { id: "tasks", header: "Tarefas abertas", align: "right", hideBelow: "lg", mobile: "meta", sortValue: (f) => f.openTasks, cell: (f) => <span className="tabular-nums text-fg-muted">{plural(f.openTasks, "tarefa", "tarefas")}</span> },
    { id: "total", header: "Total", align: "right", hideBelow: "xl", mobile: "hidden", sortValue: (f) => f.paymentsTotalCents ?? -1, cell: (f) => <Money cents={f.paymentsTotalCents} className="text-fg-muted" /> },
    { id: "paid", header: "Pago", align: "right", hideBelow: "xl", mobile: "hidden", sortValue: (f) => f.paymentsPaidCents ?? -1, cell: (f) => <Money cents={f.paymentsPaidCents} className="text-success" /> },
    { id: "pending", header: "Pendente", align: "right", hideBelow: "xl", mobile: "hidden", sortValue: (f) => (f.paymentsTotalCents == null || f.paymentsPaidCents == null ? -1 : f.paymentsTotalCents - f.paymentsPaidCents), cell: (f) => <Money cents={f.paymentsTotalCents == null || f.paymentsPaidCents == null ? null : f.paymentsTotalCents - f.paymentsPaidCents} className="font-medium" /> },
    {
      id: "access",
      header: "Acesso",
      hideBelow: "md",
      mobile: "hidden",
      sortValue: (f) => (f.hasLogin ? 1 : 0),
      cell: (f) =>
        f.hasLogin ? (
          <Badge tone="success" icon="check">Tem login</Badge>
        ) : canInvite && f.status === "ativo" ? (
          <Button
            size="xs"
            variant="secondary"
            icon="invite"
            loading={invitingId === f.id}
            onClick={(e) => {
              e.stopPropagation();
              onInvite(f);
            }}
          >
            Convidar
          </Button>
        ) : (
          <span className="text-fg-placeholder">Sem login</span>
        ),
    },
    { id: "status", header: "Status", mobile: "meta", sortValue: (f) => f.status, cell: (f) => <Badge tone={f.status === "ativo" ? "success" : "neutral"} dot>{f.status === "ativo" ? "Ativo" : "Inativo"}</Badge> },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      width: "2.5rem",
      mobile: "hidden",
      cell: (f) => (
        <RowActions
          items={[
            { label: "Abrir ficha", icon: "externalLink", onSelect: () => router.push(`/freelancers/${f.id}`) },
            { label: "Editar freelancer", icon: "edit", hidden: !canWrite, onSelect: () => onEdit(f) },
            { label: "Convidar para a plataforma", icon: "invite", hidden: !canInvite || f.hasLogin || f.status !== "ativo", onSelect: () => onInvite(f) },
            { label: f.status === "ativo" ? "Inativar freelancer…" : "Reativar freelancer", icon: f.status === "ativo" ? "archive" : "unarchive", hidden: !canWrite, separatorBefore: true, onSelect: () => onToggleStatus(f) },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(f) => f.id}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      rowHref={(f) => `/freelancers/${f.id}`}
      initialSort={{ id: "name", dir: "asc" }}
      empty={
        hasFilters
          ? { icon: "filter", title: "Nenhum freelancer com esses filtros", description: "Ajuste a busca ou limpe os filtros.", action: { label: "Limpar filtros", onClick: onClear } }
          : { icon: "freelancers", title: "Nenhum freelancer cadastrado", description: "Cadastre quem trabalha com a Draw para alocar em projetos e pagar com NF.", action: canWrite ? { label: "Novo freelancer", onClick: onCreate, icon: "add" } : undefined }
      }
    />
  );
}
