"use client";
import { useState } from "react";
import { Badge, Button, DataTable, FileDropzone, Icon, Section, Stat, type Column } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { importsApi } from "@/data/services";
import { downloadTextFile, parseCsv, toCsv, type CsvTable } from "@/lib/csv";
import { fileSize, number, plural } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ImportHistory } from "./import-history";
import { IMPORT_KINDS, normalizeDate, normalizeMoney, type WizardKind } from "./import-config";

type Report = { total: number; ok: number; errors: { line: number; message: string }[] };
type Step = "tipo" | "arquivo" | "revisao" | "fim";
const STEPS: { id: Step; label: string }[] = [
  { id: "tipo", label: "Tipo" },
  { id: "arquivo", label: "Arquivo" },
  { id: "revisao", label: "Revisão" },
  { id: "fim", label: "Concluído" },
];

const isWarning = (m: string) => m.includes("será atualizado");

function Stepper({ step }: { step: Step }) {
  const idx = STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2" aria-label="Etapas da importação">
      {STEPS.map((s, i) => (
        <li key={s.id} aria-current={i === idx ? "step" : undefined} className="flex items-center gap-2">
          <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-semibold", i < idx ? "bg-success text-accent-fg" : i === idx ? "bg-accent-solid text-accent-fg" : "bg-layer text-fg-subtle")}>
            {i < idx ? <Icon name="check" size="xs" /> : i + 1}
          </span>
          <span className={cn("text-xs max-sm:hidden", i === idx ? "font-medium text-fg" : "text-fg-subtle")}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="h-px w-6 bg-line-strong sm:w-10" />}
        </li>
      ))}
    </ol>
  );
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>("tipo");
  const [kind, setKind] = useState<WizardKind>("clientes");
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [report, setReport] = useState<Report | null>(null);
  const [noValid, setNoValid] = useState(false);
  const [done, setDone] = useState<{ imported: number; total: number } | null>(null);

  const cfg = IMPORT_KINDS.find((k) => k.value === kind)!;

  const preview = useApiMutation((a: { kind: WizardKind; rows: CsvTable["rows"] }) => importsApi.preview(a.kind, a.rows), { success: false, onSuccess: () => setStep("revisao") });
  const commit = useApiMutation((a: { rows: CsvTable["rows"]; report: Report }) => importsApi.commit(kind, file!.name, a.rows, a.report), {
    success: false,
    onSuccess: (job) => {
      setDone({ imported: job.report.ok, total: job.report.total });
      setStep("fim");
    },
  });

  const reset = () => {
    setStep("tipo");
    setFile(null);
    setTable(null);
    setReport(null);
    setDone(null);
    setFileError(undefined);
    setNoValid(false);
  };

  const downloadTemplate = () => downloadTextFile(cfg.file, toCsv(cfg.columns, [cfg.example]));

  const onFile = async (f: File | null) => {
    setFile(f);
    setTable(null);
    setFileError(undefined);
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) {
      setFile(null);
      setFileError("Planilhas .xlsx ainda não são lidas aqui. No Excel, use Arquivo › Salvar como › CSV UTF-8 e envie o CSV.");
      return;
    }
    const parsed = parseCsv(await f.text());
    const missing = cfg.required.filter((c) => !parsed.headers.includes(c));
    if (!parsed.headers.length || !parsed.rows.length) {
      setFile(null);
      setFileError("O arquivo está vazio. Baixe o modelo, preencha as linhas e envie de novo.");
    } else if (missing.length) {
      setFile(null);
      setFileError(`Faltam colunas obrigatórias: ${missing.join(", ")}. Confira o cabeçalho com o modelo.`);
    } else if (parsed.rows.length > 2000) {
      setFile(null);
      setFileError("O arquivo passa de 2.000 linhas. Divida em arquivos menores.");
    } else setTable(parsed);
  };

  /** Normaliza campos (data BR, moeda) e gera erros locais que o serviço não cobre. */
  const prepare = () => {
    const local: Report["errors"] = [];
    const rows = table!.rows.map((r, i) => {
      if (kind !== "recebiveis") return r;
      const n: Record<string, string> = { ...r, valor: normalizeMoney(r.valor ?? "") };
      if (r.vencimento) {
        const d = normalizeDate(r.vencimento);
        if (d) n.vencimento = d;
        else local.push({ line: i + 2, message: `Vencimento inválido: ${r.vencimento} (use dd/mm/aaaa)` });
      }
      return n;
    });
    return { rows, local };
  };
  const [prepared, setPrepared] = useState<ReturnType<typeof prepare> | null>(null);

  const runPreview = () => {
    if (!table) return;
    const p = prepare();
    setPrepared(p);
    preview.mutate(
      { kind, rows: p.rows },
      {
        onSuccess: (r) => {
          const errors = [...r.errors, ...p.local].sort((a, b) => a.line - b.line);
          const blocking = new Set(errors.filter((e) => !isWarning(e.message)).map((e) => e.line));
          setReport({ total: r.total, ok: r.total - blocking.size, errors });
        },
      },
    );
  };

  const errorsByLine = new Map<number, { message: string; warn: boolean }>();
  report?.errors.forEach((e) => !errorsByLine.has(e.line) && errorsByLine.set(e.line, { message: e.message, warn: isWarning(e.message) }));

  type PreviewRow = Record<string, string> & { __line: string };
  const previewRows: PreviewRow[] = (prepared?.rows ?? []).slice(0, 10).map((r, i) => ({ ...r, __line: String(i + 2) }));
  const previewCols: Column<PreviewRow>[] = [
    { id: "__line", header: "Linha", mobile: "title", cell: (r) => <span className="font-mono text-xs text-fg-subtle">{r.__line}</span> },
    ...cfg.columns.map<Column<PreviewRow>>((c) => ({ id: c, header: c, mobile: "meta", cell: (r) => <span className="line-clamp-1 max-w-48">{r[c] || <span className="text-fg-placeholder">—</span>}</span> })),
    {
      id: "__status",
      header: "Situação",
      mobile: "meta",
      cell: (r) => {
        const e = errorsByLine.get(Number(r.__line));
        return e ? <Badge tone={e.warn ? "warning" : "danger"}>{e.warn ? "Atualiza" : "Erro"}</Badge> : <Badge tone="success">Válida</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-fg">Importar planilha</h2>
          <p className="text-sm text-fg-subtle">Traga clientes, freelancers e recebíveis em CSV. Você revisa tudo antes de gravar.</p>
        </div>
        <Stepper step={step} />
      </div>

      {step === "tipo" && (
        <Section title="O que você vai importar?" icon="upload">
          <div role="radiogroup" aria-label="Tipo de importação" className="grid gap-3 sm:grid-cols-3">
            {IMPORT_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                onClick={() => setKind(k.value)}
                className={cn("flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors max-md:min-h-11", kind === k.value ? "border-accent bg-accent-subtle" : "border-line hover:bg-layer-hover")}
              >
                <span className={cn("flex size-8 items-center justify-center rounded-md", kind === k.value ? "bg-accent-solid text-accent-fg" : "bg-layer text-fg-muted")}>
                  <Icon name={k.icon} size="md" />
                </span>
                <span className="text-sm font-medium text-fg">{k.label}</span>
                <span className="text-xs text-fg-subtle">{k.description}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" iconRight="arrowRight" onClick={() => setStep("arquivo")}>
              Continuar
            </Button>
          </div>
        </Section>
      )}

      {step === "arquivo" && (
        <Section title={`Arquivo de ${cfg.label.toLowerCase()}`} description="Cabeçalho na primeira linha. Aceita separador ; ou , e campos entre aspas." icon="file">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">Modelo com as colunas certas</p>
                <p className="break-words font-mono text-xs text-fg-subtle">{cfg.columns.join(" ; ")}</p>
              </div>
              <Button variant="secondary" size="sm" icon="download" onClick={downloadTemplate}>
                Baixar modelo CSV
              </Button>
            </div>
            <FileDropzone label="Planilha em CSV" required file={file} onFile={onFile} accept=".csv,.xlsx,.xls,text/csv" hint="CSV UTF-8, até 2.000 linhas." error={fileError} />
            {table && file && (
              <p className="text-sm text-fg-muted">
                <Icon name="success" size="sm" className="mr-1 inline text-success" />
                {plural(table.rows.length, "linha lida", "linhas lidas")} de {file.name} ({fileSize(file.size)}).
              </p>
            )}
          </div>
          <div className="mt-4 flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("tipo")}>
              Voltar
            </Button>
            <Button variant="primary" loading={preview.isPending} onClick={() => (table ? runPreview() : setFileError("Escolha um arquivo CSV para continuar"))}>
              Validar planilha
            </Button>
          </div>
        </Section>
      )}

      {step === "revisao" && report && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Linhas lidas" icon="file" value={number(report.total)} />
            <Stat label="Válidas" icon="success" tone="success" value={number(report.ok)} />
            <Stat label="Com erro" icon="error" tone={report.total - report.ok ? "danger" : "neutral"} value={number(report.total - report.ok)} />
          </div>
          <Section title="Pré-visualização" description={`Primeiras ${previewRows.length} linhas de ${file?.name}. Nada foi gravado ainda.`} icon="viewList" bodyClassName="p-0">
            <DataTable rows={previewRows} columns={previewCols} getRowId={(r) => r.__line} pageSize={10} dense />
          </Section>
          {report.errors.length > 0 && (
            <Section title="Relatório por linha" description="Linhas com erro são puladas; avisos não impedem a importação." icon="warning">
              <ul className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin" aria-label="Erros e avisos por linha">
                {report.errors.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge tone={isWarning(e.message) ? "warning" : "danger"} className="mt-0.5">
                      Linha {e.line}
                    </Badge>
                    <span className="text-fg-muted">{e.message}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("arquivo")}>
              Trocar arquivo
            </Button>
            <Button
              variant="primary"
              icon="check"
              loading={commit.isPending}
              onClick={() => {
                if (report.ok === 0) {
                  setNoValid(true);
                  return;
                }
                commit.mutate({ rows: prepared!.rows, report });
              }}
            >
              Importar {plural(report.ok, "linha válida", "linhas válidas")}
            </Button>
          </div>
          {report.ok === 0 && noValid && (
            <p role="alert" className="text-sm text-danger">
              Nenhuma linha válida para importar. Corrija a planilha e valide de novo.
            </p>
          )}
        </div>
      )}

      {step === "fim" && done && (
        <Section title="Importação concluída" icon="success">
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-success-subtle text-success">
              <Icon name="success" size="xl" />
            </span>
            <p className="text-md font-semibold text-fg">{plural(done.imported, "linha importada", "linhas importadas")}</p>
            <p className="text-sm text-fg-subtle">
              {done.total - done.imported > 0 ? `${plural(done.total - done.imported, "linha foi pulada", "linhas foram puladas")} por erro. ` : "Nenhuma linha com erro. "}O registro fica no histórico abaixo.
            </p>
            <Button variant="primary" onClick={reset}>
              Nova importação
            </Button>
          </div>
        </Section>
      )}

      <ImportHistory />
    </div>
  );
}
