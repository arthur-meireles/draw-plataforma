"use client";
/** Tabela de clientes (RF-M2-01): nome + razão social, CNPJ, grupo, segmento, projetos, contratado, último projeto, status. */
import { useRouter } from "next/navigation";
import { DataTable, RowActions, type Column } from "@/components/ui";
import { Money } from "@/components/domain";
import { dateFull, formatCnpj } from "@/lib/format";
import { ClientStatusBadge } from "./client-status-badge";
import type { ClientRow } from "./use-clients";

export interface ClientTableProps {
  rows: ClientRow[] | undefined;
  isLoading?: boolean;
  error?: { message?: string; status?: number } | null;
  onRetry?: () => void;
  hasFilters: boolean;
  onClear: () => void;
  onCreate?: () => void;
  canWrite: boolean;
  canCreateProject: boolean;
  onEdit: (c: ClientRow) => void;
  onDelete: (c: ClientRow) => void;
}

export function ClientTable({ rows, isLoading, error, onRetry, hasFilters, onClear, onCreate, canWrite, canCreateProject, onEdit, onDelete }: ClientTableProps) {
  const router = useRouter();
  const columns: Column<ClientRow>[] = [
    {
      id: "name",
      header: "Cliente",
      mobile: "title",
      sortValue: (c) => c.tradeName,
      cell: (c) => (
        <span className="block min-w-0">
          <span className="block max-w-72 truncate font-medium text-fg max-md:max-w-none">{c.tradeName}</span>
          <span className="block max-w-72 truncate text-xs text-fg-subtle max-md:max-w-none">{c.legalName}</span>
        </span>
      ),
    },
    { id: "cnpj", header: "CNPJ", hideBelow: "lg", mobile: "hidden", cell: (c) => <span className="whitespace-nowrap font-mono text-xs text-fg-muted">{formatCnpj(c.cnpj)}</span> },
    { id: "group", header: "Grupo", hideBelow: "xl", mobile: "hidden", sortValue: (c) => c.groupName, cell: (c) => <span className="text-fg-muted">{c.groupName ?? "—"}</span> },
    { id: "segment", header: "Segmento", hideBelow: "md", mobile: "meta", sortValue: (c) => c.segment, cell: (c) => <span className="text-fg-muted">{c.segment}</span> },
    {
      id: "projects",
      header: "Projetos",
      align: "right",
      hideBelow: "md",
      mobile: "meta",
      sortValue: (c) => c.projectsActive,
      cell: (c) => (
        <span className="whitespace-nowrap tabular-nums text-fg-muted">
          <span className="font-medium text-fg">{c.projectsActive}</span> ativos / {c.projectsTotal}
        </span>
      ),
    },
    { id: "contracted", header: "Contratado", align: "right", mobile: "trailing", sortValue: (c) => c.contractedCents, cell: (c) => <Money cents={c.contractedCents} className="font-medium text-fg" /> },
    { id: "last", header: "Último projeto", hideBelow: "xl", mobile: "hidden", sortValue: (c) => c.lastProjectAt, cell: (c) => <span className="text-fg-muted">{c.lastProjectAt ? dateFull(c.lastProjectAt) : "—"}</span> },
    { id: "status", header: "Status", mobile: "subtitle", sortValue: (c) => c.status, cell: (c) => <ClientStatusBadge status={c.status} /> },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      width: "2.5rem",
      mobile: "hidden",
      cell: (c) => (
        <RowActions
          items={[
            { label: "Abrir ficha", icon: "externalLink", onSelect: () => router.push(`/clientes/${c.id}`) },
            { label: "Editar cliente", icon: "edit", hidden: !canWrite, onSelect: () => onEdit(c) },
            { label: "Novo projeto para este cliente", icon: "project", hidden: !canCreateProject, onSelect: () => router.push(`/projetos/novo?cliente=${c.id}`) },
            { label: "Excluir cliente…", icon: "delete", destructive: true, hidden: !canWrite, separatorBefore: true, onSelect: () => onDelete(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(c) => c.id}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      rowHref={(c) => `/clientes/${c.id}`}
      initialSort={{ id: "name", dir: "asc" }}
      empty={
        hasFilters
          ? { icon: "filter", title: "Nenhum cliente com esses filtros", description: "Ajuste a busca ou limpe os filtros.", action: { label: "Limpar filtros", onClick: onClear } }
          : { icon: "clients", title: "Nenhum cliente cadastrado", description: "Cadastre o primeiro cliente para abrir cotações e projetos.", action: canWrite ? { label: "Novo cliente", onClick: onCreate, icon: "add" } : undefined }
      }
    />
  );
}
