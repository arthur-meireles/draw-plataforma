"use client";
import { Suspense, useMemo, useState } from "react";
import { AccessGate } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Button, Callout, ClearFiltersButton, ConfirmDialog, DataTable, Fab, FilterSelect, Icon, IconButton, PageBody, PageHeader, RowActions, SearchInput, Toolbar, type Column } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { admApi } from "@/data/services";
import { dateFull, fileSize, plural } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { DocumentFormDialog, type DocumentRow } from "./document-form-dialog";
import { DOCUMENT_CATEGORY_LABEL, documentCategoryOptions, validityOf, ValidityBadge, type ValidityState } from "./document-meta";
import { useDownloadFile } from "./use-download-file";

const STATE_OPTIONS: { value: ValidityState; label: string }[] = [
  { value: "vencido", label: "Vencidos" },
  { value: "vencendo", label: "Vencem em até 30 dias" },
  { value: "valido", label: "Válidos" },
  { value: "sem_validade", label: "Sem validade" },
];

function Content() {
  const p = usePermissions();
  const canEdit = p.canWriteAll("adm");
  const [f, setF] = useUrlState({ q: "", categoria: "", validade: "" });
  const docs = useApiQuery(["adm", "documents"], admApi.documents);
  const [form, setForm] = useState<{ doc: DocumentRow | null } | null>(null);
  const [removing, setRemoving] = useState<DocumentRow | null>(null);
  const download = useDownloadFile();
  const remove = useApiMutation(admApi.removeDocument, { success: "Documento excluído", onSuccess: () => setRemoving(null) });

  const rows = docs.data as (DocumentRow & { currentVersion: { id: string; size: number } | null })[] | undefined;
  const counts = useMemo(() => {
    const c = { vencido: 0, vencendo: 0 };
    rows?.forEach((d) => {
      const s = validityOf(d.validUntil).state;
      if (s === "vencido") c.vencido++;
      if (s === "vencendo") c.vencendo++;
    });
    return c;
  }, [rows]);

  const filtered = rows?.filter((d) => {
    const q = f.q.trim().toLowerCase();
    if (q && !d.title.toLowerCase().includes(q)) return false;
    if (f.categoria && d.category !== f.categoria) return false;
    if (f.validade && validityOf(d.validUntil).state !== f.validade) return false;
    return true;
  });

  const columns: Column<NonNullable<typeof rows>[number]>[] = [
    {
      id: "title",
      header: "Título",
      mobile: "title",
      sortValue: (d) => d.title,
      cell: (d) => (
        <span className="flex items-center gap-2">
          <Icon name="document" size="sm" className="text-fg-subtle" />
          <span className="font-medium text-fg">{d.title}</span>
        </span>
      ),
    },
    { id: "category", header: "Categoria", hideBelow: "md", mobile: "subtitle", sortValue: (d) => DOCUMENT_CATEGORY_LABEL[d.category], cell: (d) => <span className="text-fg-muted">{DOCUMENT_CATEGORY_LABEL[d.category]}</span> },
    { id: "valid", header: "Validade", sortValue: (d) => d.validUntil ?? "9999", cell: (d) => (
      <span className="flex flex-wrap items-center gap-2">
        <ValidityBadge validUntil={d.validUntil} />
        {d.validUntil && <span className="text-xs text-fg-subtle">{dateFull(d.validUntil)}</span>}
      </span>
    ) },
    {
      id: "file",
      header: "Arquivo",
      hideBelow: "lg",
      mobile: "hidden",
      cell: (d) =>
        d.file && d.currentVersion ? (
          <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <span className="max-w-48 truncate">{d.file.name}</span>
            <span>· {fileSize(d.currentVersion.size)}</span>
          </span>
        ) : (
          <span className="text-xs text-fg-placeholder">Sem arquivo</span>
        ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      align: "right",
      width: "7rem",
      mobile: "trailing",
      cell: (d) => (
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {d.currentVersion && <IconButton icon="download" label={`Baixar ${d.title}`} loading={download.isPending && download.variables === d.currentVersion.id} onClick={() => download.mutate(d.currentVersion!.id)} />}
          {canEdit && (
            <RowActions
              label={`Ações de ${d.title}`}
              items={[
                { label: "Editar", icon: "edit", onSelect: () => setForm({ doc: d }) },
                { label: d.file ? "Substituir arquivo" : "Anexar arquivo", icon: "upload", onSelect: () => setForm({ doc: d }) },
                { label: "Excluir…", icon: "delete", destructive: true, separatorBefore: true, onSelect: () => setRemoving(d) },
              ]}
            />
          )}
        </div>
      ),
    },
  ];

  const alerts = counts.vencido + counts.vencendo;
  return (
    <>
      <PageHeader crumbs={[{ label: "Administrativo", icon: "adm", href: "/adm/tarefas" }, { label: "Documentos" }]} count={rows?.length} actions={canEdit && <Button size="sm" variant="primary" icon="add" onClick={() => setForm({ doc: null })} className="max-md:hidden">Novo documento</Button>} />
      {alerts > 0 && (
        <div className="shrink-0 border-b border-line p-3 md:px-4">
          <Callout
            tone={counts.vencido ? "danger" : "warning"}
            title={[counts.vencido ? plural(counts.vencido, "documento vencido", "documentos vencidos") : null, counts.vencendo ? `${plural(counts.vencendo, "vence", "vencem")} em até 30 dias` : null].filter(Boolean).join(" · ")}
            action={
              <Button size="sm" variant="outline" onClick={() => setF({ validade: counts.vencido ? "vencido" : "vencendo" })}>
                Ver {counts.vencido ? "vencidos" : "a vencer"}
              </Button>
            }
          >
            Renove os documentos para manter a Draw regular em propostas e licitações.
          </Callout>
        </div>
      )}
      <Toolbar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Buscar documento…" className="max-md:w-44 max-md:shrink-0" />
        <FilterSelect label="Categoria" value={f.categoria || null} options={documentCategoryOptions} onChange={(v) => setF({ categoria: v ?? "" })} />
        <FilterSelect label="Validade" value={f.validade || null} options={STATE_OPTIONS} onChange={(v) => setF({ validade: v ?? "" })} />
        <ClearFiltersButton show={!!(f.q || f.categoria || f.validade)} onClick={() => setF({ q: "", categoria: "", validade: "" })} />
      </Toolbar>
      <PageBody padded={false}>
        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(d) => d.id}
          isLoading={docs.isLoading}
          error={docs.error}
          onRetry={() => docs.refetch()}
          initialSort={{ id: "valid", dir: "asc" }}
          empty={rows?.length ? { icon: "search", title: "Nenhum documento encontrado", description: "Ajuste a busca ou limpe os filtros." } : { icon: "document", title: "Nenhum documento cadastrado", description: "Cadastre contrato social, certidões, alvarás e apólices com a data de validade.", action: canEdit ? { label: "Novo documento", icon: "add", onClick: () => setForm({ doc: null }) } : undefined }}
        />
      </PageBody>
      {canEdit && <Fab label="Novo documento" onClick={() => setForm({ doc: null })} />}
      <DocumentFormDialog open={!!form} onOpenChange={(o) => !o && setForm(null)} document={form?.doc ?? null} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Excluir documento?" description={`"${removing?.title}" sai da lista. O arquivo continua no histórico de versões.`} confirmLabel="Excluir documento" destructive loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} />
    </>
  );
}

export function DocumentsView() {
  return (
    <AccessGate resource="adm">
      <Suspense>
        <Content />
      </Suspense>
    </AccessGate>
  );
}
