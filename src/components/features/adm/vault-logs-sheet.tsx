"use client";
import { Badge, DataTable, Sheet, type Column } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { admExtraApi } from "@/data/services";
import { dateTime } from "@/lib/format";

type LogRow = Awaited<ReturnType<typeof admExtraApi.vaultLogs>>[number];

const ACTION: Record<LogRow["action"], { label: string; tone: "warning" | "info" | "neutral" | "success" | "danger" }> = {
  revelar: { label: "Revelou", tone: "warning" },
  copiar: { label: "Copiou", tone: "info" },
  editar: { label: "Editou", tone: "neutral" },
  criar: { label: "Criou", tone: "success" },
  remover: { label: "Removeu", tone: "danger" },
};

/** Log de acesso ao cofre: de um item ou geral (admin). RF-M6-03. */
export function VaultLogsSheet({ open, onClose, itemId, itemTitle }: { open: boolean; onClose: () => void; itemId?: string | null; itemTitle?: string }) {
  const q = useApiQuery(["adm", "vault-logs", itemId ?? "all"], () => admExtraApi.vaultLogs(itemId ?? undefined), { enabled: open });
  const columns: Column<LogRow>[] = [
    { id: "at", header: "Quando", mobile: "subtitle", sortValue: (l) => l.at, cell: (l) => <span className="whitespace-nowrap text-fg-muted">{dateTime(l.at)}</span> },
    { id: "user", header: "Quem", mobile: "title", cell: (l) => <span className="font-medium text-fg">{l.userName}</span> },
    { id: "action", header: "Ação", mobile: "trailing", cell: (l) => <Badge tone={ACTION[l.action].tone}>{ACTION[l.action].label}</Badge> },
    { id: "detail", header: "Detalhe", hideBelow: "md", cell: (l) => <span className="text-fg-subtle">{l.detail ?? "—"}</span> },
    ...(itemId ? [] : [{ id: "item", header: "Item", cell: (l: LogRow) => <span className="text-fg-muted">{l.itemTitle}</span> } satisfies Column<LogRow>]),
  ];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} width="md" title={itemId ? `Acessos · ${itemTitle ?? "item"}` : "Log de acessos ao cofre"} ariaTitle="Log de acessos ao cofre">
      <DataTable rows={q.data} columns={columns} getRowId={(l) => l.id} isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} pageSize={50} empty={{ icon: "history", title: "Nenhum acesso registrado", description: "Cada revelação ou cópia de senha aparece aqui, com quem fez e quando.", compact: true }} />
    </Sheet>
  );
}
