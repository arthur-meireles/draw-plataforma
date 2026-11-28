"use client";
/** Lixeira do Drive (RN-79): arquivos excluídos ficam 30 dias e podem ser restaurados por quem gerencia Arquivos. */
import { Button, DataTable, Sheet, type Column } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { driveTrashApi, TRASH_DAYS } from "@/data/services";
import { dateTime, plural } from "@/lib/format";

type Row = Awaited<ReturnType<typeof driveTrashApi.list>>[number];

export function TrashSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const q = useApiQuery(["drive", "trash"], driveTrashApi.list, { enabled: open });
  const restore = useApiMutation((id: string) => driveTrashApi.restore(id), { success: "Arquivo restaurado" });
  const columns: Column<Row>[] = [
    { id: "name", header: "Arquivo", mobile: "title", cell: (f) => <span className="font-medium text-fg">{f.name}</span> },
    { id: "project", header: "Projeto", hideBelow: "md", mobile: "subtitle", cell: (f) => <span className="font-mono text-xs text-fg-muted">{f.projectCode ?? "—"}</span> },
    { id: "when", header: "Excluído em", hideBelow: "md", cell: (f) => <span className="whitespace-nowrap text-fg-subtle">{dateTime(f.deletedAt)}</span> },
    { id: "left", header: "Some em", mobile: "trailing", cell: (f) => <span className="whitespace-nowrap text-fg-muted">{plural(f.daysLeft, "dia", "dias")}</span> },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      width: "8rem",
      cell: (f) => (
        <Button size="sm" variant="outline" icon="restore" loading={restore.isPending && restore.variables === f.id} onClick={() => restore.mutate(f.id)}>
          Restaurar
        </Button>
      ),
    },
  ];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} width="md" title="Lixeira" ariaTitle="Lixeira de arquivos">
      <p className="px-4 pt-3 text-xs text-fg-subtle">Arquivos excluídos ficam aqui por {TRASH_DAYS} dias. Depois disso são removidos de vez.</p>
      <DataTable rows={q.data} columns={columns} getRowId={(f) => f.id} isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} empty={{ icon: "success", title: "Lixeira vazia", description: "Quando você excluir um arquivo, ele aparece aqui e pode ser restaurado.", compact: true }} />
    </Sheet>
  );
}
