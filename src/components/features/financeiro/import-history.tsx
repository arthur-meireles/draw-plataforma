"use client";
import { Badge, DataTable, Section, type Column } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { importsApi } from "@/data/services";
import { dateTime } from "@/lib/format";

type Job = Awaited<ReturnType<typeof importsApi.list>>[number];

const KIND_LABEL: Record<string, string> = { clientes: "Clientes", freelancers: "Freelancers", recebiveis: "Recebíveis", planilha_master: "Planilha master" };

const columns: Column<Job>[] = [
  { id: "date", header: "Data", sortValue: (j) => j.createdAt, mobile: "subtitle", cell: (j) => <span className="text-fg-muted">{dateTime(j.createdAt)}</span> },
  { id: "kind", header: "Tipo", sortValue: (j) => j.kind, mobile: "title", cell: (j) => <span className="font-medium text-fg">{KIND_LABEL[j.kind] ?? j.kind}</span> },
  { id: "file", header: "Arquivo", hideBelow: "md", mobile: "meta", cell: (j) => <span className="font-mono text-xs text-fg-muted">{j.sourceFileName}</span> },
  { id: "ok", header: "Importadas", align: "right", sortValue: (j) => j.report.ok, mobile: "trailing", cell: (j) => `${j.report.ok} de ${j.report.total}` },
  { id: "errors", header: "Erros", align: "right", hideBelow: "md", mobile: "hidden", cell: (j) => j.report.total - j.report.ok },
  {
    id: "status",
    header: "Situação",
    mobile: "meta",
    cell: (j) => (j.status === "concluida" ? <Badge tone="success" dot>Concluída</Badge> : j.status === "falhou" ? <Badge tone="danger" dot>Falhou</Badge> : <Badge tone="warning" dot>Pré-visualização</Badge>),
  },
];

/** Histórico de importações (RF-M5-08). */
export function ImportHistory() {
  const q = useApiQuery(["imports"], () => importsApi.list());
  return (
    <Section title="Histórico de importações" icon="history" bodyClassName="p-0">
      <DataTable
        rows={q.data}
        columns={columns}
        getRowId={(j) => j.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        pageSize={8}
        empty={{ icon: "upload", title: "Nenhuma importação ainda", description: "Quando você importar uma planilha, o relatório aparece aqui.", compact: true }}
      />
    </Section>
  );
}
