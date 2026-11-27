"use client";
import { Badge, DataTable, Section, Stat, type Column } from "@/components/ui";
import type { MasterReport } from "@/data/services";
import { number } from "@/lib/format";

type Line = MasterReport["lines"][number];

const SUMMARY_LABEL: Record<string, string> = {
  projetos_criados: "Projetos novos",
  projetos_atualizados: "Projetos atualizados",
  clientes_criados: "Clientes novos",
  clientes_atualizados: "Clientes atualizados",
  freelancers_criados: "Freelancers novos",
  membros: "Membros de equipe",
  recebiveis: "Parcelas a receber",
  cobrancas_adicionais: "Cobranças adicionais",
  pagaveis: "Contas a pagar",
};

const columns: Column<Line>[] = [
  {
    id: "line",
    header: "Linha",
    sortValue: (l) => l.line,
    mobile: "meta",
    cell: (l) => (
      <span className="font-mono text-xs text-fg-subtle">
        <span className="md:hidden">Linha </span>
        {l.line}
      </span>
    ),
  },
  {
    id: "id",
    header: "ID",
    sortValue: (l) => l.legacyCode,
    mobile: "title",
    cell: (l) => (
      <span className="font-mono text-xs font-medium text-fg">
        {l.legacyCode || "—"}
      </span>
    ),
  },
  {
    id: "title",
    header: "Projeto",
    mobile: "subtitle",
    cell: (l) => (
      <span className="line-clamp-1 max-w-64">
        {l.title || <span className="text-fg-placeholder">—</span>}
      </span>
    ),
  },
  {
    id: "action",
    header: "O que acontece",
    sortValue: (l) => l.action,
    mobile: "meta",
    cell: (l) =>
      l.action === "erro" ? (
        <Badge tone="danger">Erro</Badge>
      ) : l.action === "atualizar" ? (
        <Badge tone="warning">Atualiza</Badge>
      ) : (
        <Badge tone="success">Cria</Badge>
      ),
  },
  {
    id: "notes",
    header: "Detalhes",
    mobile: "meta",
    cell: (l) =>
      l.errors.length || l.notes.length ? (
        <ul className="space-y-0.5 text-xs">
          {l.errors.map((e, i) => (
            <li key={`e${i}`} className="text-danger">
              {e}
            </li>
          ))}
          {l.notes.map((n, i) => (
            <li key={`n${i}`} className="text-fg-muted">
              {n}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-fg-placeholder">—</span>
      ),
  },
];

/** Relatório por linha do dry run da planilha master (RN-44): o que será criado, atualizado ou pulado. */
export function MasterImportReport({
  report,
  fileName,
  sheetName,
}: {
  report: MasterReport;
  fileName?: string;
  sheetName?: string | null;
}) {
  const summary = Object.entries(report.summary).filter(([, v]) => v > 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Projetos lidos" icon="file" value={number(report.total)} />
        <Stat
          label="Válidos"
          icon="success"
          tone="success"
          value={number(report.ok)}
        />
        <Stat
          label="Com erro"
          icon="error"
          tone={report.total - report.ok ? "danger" : "neutral"}
          value={number(report.total - report.ok)}
        />
      </div>
      {summary.length > 0 && (
        <Section
          title="O que será gravado"
          description="Linhas com erro ficam de fora. Reimportar a mesma planilha atualiza pelo ID, sem duplicar."
          icon="viewList"
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {summary.map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-2 border-b border-line pb-1"
              >
                <dt className="text-xs text-fg-subtle">
                  {SUMMARY_LABEL[k] ?? k}
                </dt>
                <dd className="text-sm font-medium tabular-nums text-fg">
                  {number(v)}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}
      <Section
        title="Relatório por linha"
        description={`${fileName ?? ""}${sheetName ? ` · aba "${sheetName}"` : ""}. Nada foi gravado ainda.`}
        icon="warning"
        bodyClassName="p-0"
      >
        <DataTable
          rows={report.lines}
          columns={columns}
          getRowId={(l) => `${l.line}`}
          pageSize={20}
          dense
          initialSort={{ id: "line", dir: "asc" }}
        />
      </Section>
    </div>
  );
}
