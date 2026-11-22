"use client";
import { Badge, Callout, DataTable, type Column } from "@/components/ui";
import { ROLE_LABEL } from "@/data/reference";
import type { Role } from "@/data/types";
import { PERMISSION_MATRIX, type Access, type Resource } from "@/lib/permissions";
import { INVITABLE_ROLES, RESOURCE_LABEL } from "./roles";

const ACCESS: Record<Access, { label: string; tone: "success" | "info" | "violet" | "neutral" }> = {
  T: { label: "Total", tone: "success" },
  L: { label: "Leitura", tone: "info" },
  P: { label: "Próprios", tone: "violet" },
  "-": { label: "Sem acesso", tone: "neutral" },
};

const rows = Object.keys(PERMISSION_MATRIX) as Resource[];

/** Matriz de permissões (seção 9), somente leitura — vem de src/lib/permissions.ts. */
export function PermissionMatrix() {
  const columns: Column<Resource>[] = [
    { id: "resource", header: "Recurso", mobile: "title", cell: (r) => <span className="font-medium text-fg">{RESOURCE_LABEL[r]}</span> },
    ...INVITABLE_ROLES.map(
      (role: Role): Column<Resource> => ({
        id: role,
        header: ROLE_LABEL[role],
        align: "center",
        cell: (r) => {
          const a = PERMISSION_MATRIX[r][role];
          return (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-xs text-fg-subtle md:hidden">{ROLE_LABEL[role]}:</span>
              {a === "-" ? <span className="text-fg-placeholder">—</span> : <Badge tone={ACCESS[a].tone} size="xs">{ACCESS[a].label}</Badge>}
            </span>
          );
        },
      }),
    ),
  ];
  return (
    <div>
      <div className="space-y-3 p-3 md:p-4">
        <Callout tone="info" title="Perfis são fixos e definidos no sistema">
          <span className="block">
            <strong className="font-medium text-fg">Total</strong>: ler e alterar tudo · <strong className="font-medium text-fg">Leitura</strong>: só consultar · <strong className="font-medium text-fg">Próprios</strong>: apenas o que é seu ou onde está alocado. O serviço aplica estas regras em toda requisição; as telas apenas escondem ações.
          </span>
        </Callout>
      </div>
      <DataTable rows={rows} columns={columns} getRowId={(r) => r} pageSize={50} />
    </div>
  );
}
