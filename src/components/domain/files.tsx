"use client";
/**
 * Gerenciador de arquivos (RF-M7-01/02/03/04, RF-M4-11): envio múltiplo por arrastar (celular: câmera/galeria),
 * categorias, versões com sha256, restaurar versão, download, liberação para freelancers, busca e filtros.
 * Reutilizado pelo prontuário do projeto e pela biblioteca `/arquivos`.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import {
  Badge,
  Button,
  Combobox,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FilterChip,
  Icon,
  RowActions,
  SearchInput,
  SegmentedControl,
  Sheet,
  Skeleton,
  SuccessCheck,
  useEntrance,
  useSuccessFlash,
  Switch,
  ClearFiltersButton,
  Tooltip,
  SelectField,
  type Column,
  type MenuItem,
  type Option,
} from "@/components/ui";
import type { IconName } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { filesApi, projectsApi, type FileFilters } from "@/data/services";
import { FILE_CATEGORY_LABEL } from "@/data/reference";
import type { FileCategory, ID } from "@/data/types";
import { cn } from "@/lib/cn";
import { dateTime, fileSize, relative, plural } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { toast } from "sonner";

export type FileRow = Awaited<ReturnType<typeof filesApi.list>>[number];

const CATEGORIES = Object.keys(FILE_CATEGORY_LABEL) as FileCategory[];

function fileIcon(mime: string | undefined, name: string): IconName {
  const m = mime ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv") || /\.(xlsx?|csv)$/i.test(name)) return "spreadsheet";
  return "file";
}

const shortHash = (h: string | undefined) => (h ? h.slice(0, 8) : "—");

/** Dispara o download (mock: sem conteúdo guardado → aviso de arquivo de demonstração). */
export function useFileDownload() {
  return useApiMutation(
    async ({ versionId }: { versionId: ID }) => {
      const r = await filesApi.downloadUrl(versionId);
      return r;
    },
    {
      success: false,
      onSuccess: (r) => {
        if (!r.url) {
          toast.info("Arquivo de demonstração", { description: `O conteúdo de "${r.name}" não é guardado neste protótipo. Em produção, o download usa um link assinado de 5 minutos.` });
          return;
        }
        const a = document.createElement("a");
        a.href = r.url;
        a.download = r.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success(`Download de "${r.name}" iniciado`);
      },
    },
  );
}

/* ───────── envio ───────── */

interface UploadTarget {
  projectId?: ID | null;
  /** Pasta real do Drive que recebe os arquivos (sem projeto). */
  folderId?: ID | null;
}

/** Diálogo de envio: confirma categoria, projeto (biblioteca) e liberação, e envia um a um. */
function UploadDialog({ files, onClose, target, askProject, defaultCategory }: { files: File[]; onClose: () => void; target: UploadTarget; askProject: boolean; defaultCategory: FileCategory }) {
  const { money, isFreelancer, canWriteAll } = usePermissions();
  const [category, setCategory] = useState<FileCategory>(defaultCategory);
  const [projectId, setProjectId] = useState<ID | null>(target.projectId ?? null);
  const [released, setReleased] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string>();
  const projects = useApiQuery(["projects", "options"], () => projectsApi.list(), { enabled: askProject, staleTime: 30_000 });
  const sent = useSuccessFlash();
  const upload = useApiMutation(
    async () => {
      let done = 0;
      setProgress({ done, total: files.length });
      for (const file of files) {
        await filesApi.upload({ projectId, folderId: target.folderId ?? null, category, file, releasedToFreelancers: isFreelancer ? true : released });
        done++;
        setProgress({ done, total: files.length });
      }
      return done;
    },
    {
      success: (n) => `${plural(n, "arquivo enviado", "arquivos enviados")}`,
      onSuccess: () => sent.flash(onClose, 750),
      onError: (e) => {
        setProgress(null);
        setError(e.message);
      },
    },
  );
  const categoryOptions: Option<FileCategory>[] = CATEGORIES.filter((c) => money || !["proposta", "nf"].includes(c)).map((c) => ({ value: c, label: FILE_CATEGORY_LABEL[c] }));
  const projectOptions: Option[] = (projects.data ?? []).filter((p) => p.status !== "cancelado").map((p) => ({ value: p.id, label: `${p.code} · ${p.title}`, description: p.clientName, keywords: [p.clientName] }));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !upload.isPending && onClose()}
      title={plural(files.length, "arquivo para enviar", "arquivos para enviar")}
      description="Se já existir um arquivo com o mesmo nome no projeto, o envio vira uma nova versão e a anterior é preservada."
      dismissible={!upload.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={upload.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon="upload"
            loading={upload.isPending}
            success={sent.success}
            successLabel="Enviados"
            onClick={() => {
              if (askProject && !projectId) {
                setError("Escolha o projeto que receberá os arquivos");
                return;
              }
              setError(undefined);
              upload.mutate(undefined);
            }}
          >
            {progress && upload.isPending ? `Enviando ${progress.done + 1} de ${progress.total}…` : "Enviar arquivos"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line scrollbar-thin">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative flex items-center gap-2 px-3 py-2 text-sm">
              <Icon name={fileIcon(f.type, f.name)} size="sm" className="text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate text-fg">{f.name}</span>
              {progress && i < progress.done ? (
                <span className="motion-slide-in flex shrink-0 items-center gap-1 text-xs text-success">
                  <SuccessCheck size={12} />
                  Enviado
                </span>
              ) : (
                <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{progress && upload.isPending && i === progress.done ? "Enviando…" : fileSize(f.size)}</span>
              )}
              {progress && upload.isPending && i === progress.done && <span aria-hidden className="motion-progress-indeterminate absolute inset-x-0 bottom-0 h-0.5 bg-accent-subtle" />}
            </li>
          ))}
        </ul>
        {askProject && <SelectField label="Projeto" required options={projectOptions} value={projectId} onChange={setProjectId} placeholder={projects.isLoading ? "Carregando projetos…" : "Escolha o projeto"} searchPlaceholder="Buscar projeto…" error={error && !projectId ? error : undefined} />}
        <SelectField label="Categoria" options={categoryOptions} value={category} onChange={(v) => v && setCategory(v)} />
        {!isFreelancer && canWriteAll("files") && <Switch checked={released} onCheckedChange={setReleased} label="Liberar para freelancers" description="Freelancers alocados no projeto poderão ver e baixar estes arquivos." />}
        {error && projectId && <p className="text-xs text-danger" aria-live="polite">{error}</p>}
      </div>
    </Dialog>
  );
}

/** Área de arrastar e soltar + botões de envio (celular: câmera e galeria). */
function DropZone({ onFiles, compact }: { onFiles: (f: File[]) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const take = (list: FileList | null) => {
    if (list?.length) onFiles([...list]);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={cn("flex flex-col items-center gap-2 rounded-lg border border-dashed text-center transition-colors", compact ? "px-4 py-3" : "px-4 py-6", over ? "border-accent bg-accent-subtle" : "border-line-strong bg-layer/50")}
    >
      <div className="flex items-center gap-2 text-sm text-fg-muted">
        <Icon name="upload" size="sm" className="text-fg-subtle" />
        <span className="max-md:hidden">Arraste arquivos aqui ou</span>
        <span className="md:hidden">Envie arquivos:</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" icon="attach" onClick={() => pick.current?.click()}>
          Escolher arquivos
        </Button>
        <Button size="sm" icon="image" className="md:hidden" onClick={() => gallery.current?.click()}>
          Galeria
        </Button>
        <Button size="sm" icon="camera" className="md:hidden" onClick={() => camera.current?.click()}>
          Tirar foto
        </Button>
      </div>
      <input ref={pick} type="file" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" multiple accept="image/*,video/*" hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

/* ───────── detalhe ───────── */

function FileDetailSheet({ file, onClose, showProject }: { file: FileRow | null; onClose: () => void; showProject?: boolean }) {
  const { canWriteAll, isFreelancer, money } = usePermissions();
  const manage = canWriteAll("files");
  const download = useFileDownload();
  const restore = useApiMutation(({ versionId }: { versionId: ID }) => filesApi.restoreVersion(file!.id, versionId), { success: "Versão restaurada como atual" });
  const release = useApiMutation((v: boolean) => filesApi.setReleased(file!.id, v), { success: (_d) => "Liberação atualizada" });
  const recat = useApiMutation((c: FileCategory) => filesApi.setCategory(file!.id, c), { success: "Categoria atualizada" });
  const remove = useApiMutation(() => filesApi.remove(file!.id), { success: "Arquivo excluído", onSuccess: onClose });
  const newVersion = useApiMutation((f: File) => filesApi.upload({ fileId: file!.id, projectId: file!.projectId, clientId: file!.clientId, module: file!.module, category: file!.category, file: f }), { success: (r) => `Versão v${r.version} enviada` });
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState(false);
  const categoryOptions: Option<FileCategory>[] = CATEGORIES.filter((c) => money || !["proposta", "nf"].includes(c)).map((c) => ({ value: c, label: FILE_CATEGORY_LABEL[c] }));

  return (
    <>
      <Sheet
        open={!!file}
        onOpenChange={(o) => !o && onClose()}
        width="md"
        ariaTitle="Detalhe do arquivo"
        title={file ? <span className="truncate">{file.name}</span> : "Arquivo"}
        footer={
          file && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {manage ? (
                <Button variant="destructive-ghost" icon="delete" onClick={() => setConfirm(true)}>
                  Excluir arquivo…
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button icon="upload" loading={newVersion.isPending} onClick={() => input.current?.click()}>
                  Enviar nova versão
                </Button>
                <Button variant="primary" icon="download" loading={download.isPending} onClick={() => download.mutate({ versionId: file.currentVersionId })}>
                  Baixar atual
                </Button>
              </div>
              <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) newVersion.mutate(f); e.target.value = ""; }} />
            </div>
          )
        }
      >
        {file && (
          <div className="space-y-6 px-5 py-5 md:px-6">
            <div className="flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-line bg-layer text-fg-muted">
                <Icon name={fileIcon(file.current?.mime, file.name)} size="lg" />
              </span>
              <div className="min-w-0">
                <p className="break-words text-md font-semibold text-fg">{file.name}</p>
                <p className="text-xs text-fg-subtle">
                  v{file.current?.version} · {fileSize(file.current?.size ?? 0)} · enviado por {file.uploaderName} {relative(file.current?.createdAt)}
                </p>
                {showProject && file.projectCode && (
                  <Link href={`/projetos/${file.projectCode}?aba=arquivos`} className="mt-1 inline-block font-mono text-xs text-accent hover:underline">
                    {file.projectCode}
                  </Link>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-line p-3">
              {manage ? <SelectField label="Categoria" options={categoryOptions} value={file.category} onChange={(v) => v && v !== file.category && recat.mutate(v)} /> : <p className="text-sm text-fg-muted">Categoria: {FILE_CATEGORY_LABEL[file.category]}</p>}
              {file.projectId && !isFreelancer && (
                <Switch
                  checked={file.releasedToFreelancers}
                  disabled={!manage || release.isPending}
                  onCheckedChange={(v) => release.mutate(v)}
                  label="Liberar para freelancers"
                  description="Freelancers alocados no projeto veem e baixam este arquivo (RF-M4-11)."
                />
              )}
            </div>

            <section aria-label="Versões">
              <h3 className="mb-2 text-sm font-semibold text-fg">Versões ({file.versions.length})</h3>
              <ol className="divide-y divide-line rounded-lg border border-line">
                {file.versions.map((v) => {
                  const current = v.id === file.currentVersionId;
                  return (
                    <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                      <Badge tone={current ? "accent" : "neutral"}>v{v.version}</Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-fg-muted">
                          {v.uploaderName} · {fileSize(v.size)}
                        </p>
                        <p className="text-xs text-fg-subtle">
                          {dateTime(v.createdAt)} ·{" "}
                          <Tooltip content={`SHA-256 completo: ${v.sha256}`}>
                            <span className="font-mono">{shortHash(v.sha256)}</span>
                          </Tooltip>
                          {v.note ? ` · ${v.note}` : ""}
                        </p>
                      </div>
                      {current && <span className="text-xs text-fg-subtle">Atual</span>}
                      <div className="flex items-center gap-1">
                        <Button size="xs" variant="ghost" icon="download" onClick={() => download.mutate({ versionId: v.id })}>
                          Baixar
                        </Button>
                        {!current && manage && (
                          <Button size="xs" variant="ghost" icon="restore" loading={restore.isPending} onClick={() => restore.mutate({ versionId: v.id })}>
                            Restaurar
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Excluir arquivo?"
        description={`"${file?.name}" e todas as suas versões deixarão de aparecer. O histórico do projeto registra a exclusão.`}
        confirmLabel="Excluir arquivo"
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirm(false) })}
      />
    </>
  );
}

/* ───────── lista e grade ───────── */

function CategoryBadge({ category }: { category: FileCategory }) {
  return <Badge tone={category === "entrega" ? "success" : category === "proposta" ? "violet" : category === "nf" ? "info" : "neutral"}>{FILE_CATEGORY_LABEL[category]}</Badge>;
}

function FileGrid({ files, onOpen, menuFor }: { files: FileRow[]; onOpen: (f: FileRow) => void; menuFor: (f: FileRow) => MenuItem[] }) {
  const enter = useEntrance();
  return (
    <ul className="grid grid-cols-1 gap-3 p-3 min-[480px]:grid-cols-2 md:grid-cols-3 md:p-4 xl:grid-cols-4">
      {files.map((f) => (
        <li key={f.id} style={enter(f.id).style} className={cn(enter(f.id).className, "group relative flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised-2")}>
          <button type="button" onClick={() => onOpen(f)} className="flex flex-col gap-2 text-left" aria-label={`Abrir ${f.name}`}>
            <span className="flex h-20 items-center justify-center rounded-md bg-layer text-fg-subtle">
              <Icon name={fileIcon(f.current?.mime, f.name)} size="lg" />
            </span>
            <span className="truncate pr-6 text-sm font-medium text-fg">{f.name}</span>
          </button>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
            <CategoryBadge category={f.category} />
            <span>v{f.current?.version}</span>
            <span>·</span>
            <span>{fileSize(f.current?.size ?? 0)}</span>
            {f.releasedToFreelancers && (
              <Tooltip content="Liberado para freelancers">
                <span className="inline-flex"><Icon name="share" size="xs" className="text-accent" /></span>
              </Tooltip>
            )}
          </div>
          <p className="truncate text-2xs text-fg-subtle">
            {f.uploaderName} · {relative(f.current?.createdAt)}
          </p>
          <div className="absolute right-1.5 top-1.5">
            <RowActions items={menuFor(f)} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface FileManagerProps {
  /** Dentro do prontuário: restringe ao projeto. Sem ele, é a biblioteca global. */
  projectId?: ID;
  /** Biblioteca global: filtros por projeto/cliente/módulo e agrupamento por projeto. */
  library?: boolean;
  /** Filtro de categoria padrão para novos envios. */
  defaultCategory?: FileCategory;
  className?: string;
  /** Drive: restringe a uma pasta real e envia para ela. */
  folderId?: ID;
  /** Drive: oculta área de envio e barra de filtros (o chamador fornece a própria). */
  bare?: boolean;
  /** Drive: arquivos aguardando envio, controlado pelo chamador (arrastar/soltar, botão do cabeçalho). */
  pending?: File[] | null;
  onPendingChange?: (files: File[] | null) => void;
  /** Drive: ativa "Mover para…" nos arquivos que não são de projeto. */
  onMove?: (file: FileRow) => void;
  /** Visão inicial quando a URL não define `vista`. */
  defaultView?: "lista" | "grade";
  /** Substitui o estado vazio padrão (`null` não mostra nada). */
  emptyState?: React.ReactNode;
}

/** Gerenciador de arquivos (ver topo do arquivo). Estado de busca/filtros/visão fica na URL. */
export function FileManager({ projectId, library, defaultCategory = "entrega", className, folderId, bare, pending: pendingProp, onPendingChange, onMove, emptyState, defaultView = "lista" }: FileManagerProps) {
  const { canWrite, canWriteAll, isFreelancer } = usePermissions();
  const [url, setUrl, activeCount] = useUrlState({ q: "", cat: undefined as string | undefined, vista: defaultView as string, projeto: undefined as string | undefined, cliente: undefined as string | undefined, modulo: undefined as string | undefined, arquivo: undefined as string | undefined });
  const [pendingLocal, setPendingLocal] = useState<File[] | null>(null);
  const pending = onPendingChange ? (pendingProp ?? null) : pendingLocal;
  const setPending = onPendingChange ?? setPendingLocal;
  const [toDelete, setToDelete] = useState<FileRow | null>(null);

  const filters: FileFilters = { projectId: projectId ?? url.projeto, folderId, clientId: url.cliente, module: url.modulo as FileFilters["module"], category: url.cat as FileCategory | undefined, q: url.q };
  const query = useApiQuery(["files", filters], () => filesApi.list(filters));
  const projects = useApiQuery(["projects", "options"], () => projectsApi.list(), { enabled: !!library, staleTime: 30_000 });
  const download = useFileDownload();
  const release = useApiMutation(({ id, value }: { id: ID; value: boolean }) => filesApi.setReleased(id, value), { success: (_d) => "Liberação atualizada" });
  const remove = useApiMutation((id: ID) => filesApi.remove(id), { success: "Arquivo excluído", onSuccess: () => setToDelete(null) });

  const canUpload = canWrite("files");
  const manage = canWriteAll("files");
  const files = query.data;
  const opened = files?.find((f) => f.id === url.arquivo) ?? null;
  const view = url.vista === "grade" ? "grade" : "lista";

  const menuFor = (f: FileRow): MenuItem[] => [
    { label: "Abrir detalhes e versões", icon: "file", onSelect: () => setUrl({ arquivo: f.id }) },
    { label: "Baixar versão atual", icon: "download", onSelect: () => download.mutate({ versionId: f.currentVersionId }) },
    { label: f.releasedToFreelancers ? "Remover liberação para freelancers" : "Liberar para freelancers", icon: "share", hidden: !manage || !f.projectId || isFreelancer, onSelect: () => release.mutate({ id: f.id, value: !f.releasedToFreelancers }) },
    { label: "Mover para…", icon: "folderMove", hidden: !onMove || !manage || !!f.projectId, onSelect: () => onMove?.(f) },
    { label: "Excluir arquivo…", icon: "delete", destructive: true, separatorBefore: true, hidden: !manage, onSelect: () => setToDelete(f) },
  ];

  const columns: Column<FileRow>[] = [
    {
      id: "name",
      header: "Arquivo",
      mobile: "title",
      sortValue: (f) => f.name.toLowerCase(),
      cell: (f) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-layer text-fg-muted">
            <Icon name={fileIcon(f.current?.mime, f.name)} size="sm" />
          </span>
          <span className="truncate font-medium text-fg">{f.name}</span>
          {f.releasedToFreelancers && !isFreelancer && (
            <Tooltip content="Liberado para freelancers">
              <span className="inline-flex"><Icon name="share" size="xs" className="text-accent" /></span>
            </Tooltip>
          )}
        </span>
      ),
    },
    { id: "category", width: "10rem", header: "Categoria", mobile: "meta", sortValue: (f) => FILE_CATEGORY_LABEL[f.category], cell: (f) => <CategoryBadge category={f.category} /> },
    { id: "version", width: "8.5rem", header: "Versão", mobile: "meta", hideBelow: "md", sortValue: (f) => f.current?.version ?? 0, cell: (f) => <span className="tabular-nums text-fg-muted">v{f.current?.version}<span className="ml-1.5 font-mono text-2xs text-fg-subtle">{shortHash(f.current?.sha256)}</span></span> },
    { id: "uploader", width: "11rem", header: "Enviado por", mobile: "subtitle", hideBelow: "lg", sortValue: (f) => f.uploaderName, cell: (f) => <span className="text-fg-muted">{f.uploaderName}</span> },
    { id: "size", width: "6rem", header: "Tamanho", align: "right", mobile: "meta", hideBelow: "lg", sortValue: (f) => f.current?.size ?? 0, cell: (f) => <span className="tabular-nums text-fg-muted">{fileSize(f.current?.size ?? 0)}</span> },
    { id: "date", width: "10.5rem", header: "Data", mobile: "meta", sortValue: (f) => f.current?.createdAt ?? "", cell: (f) => <span className="whitespace-nowrap text-fg-muted" title={dateTime(f.current?.createdAt)}>{relative(f.current?.createdAt)}</span> },
    { id: "actions", header: <span className="sr-only">Ações</span>, align: "right", width: "48px", mobile: "trailing", cell: (f) => <RowActions items={menuFor(f)} /> },
  ];

  const hasFilters = !!(url.q || url.cat || (library && (url.projeto || url.cliente || url.modulo)));
  const clearFilters = () => setUrl({ q: "", cat: undefined, projeto: undefined, cliente: undefined, modulo: undefined });
  void activeCount;

  const categoryOptions: Option<string>[] = CATEGORIES.map((c) => ({ value: c, label: FILE_CATEGORY_LABEL[c] }));
  const projectOptions: Option<string>[] = (projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.title}`, keywords: [p.clientName] }));
  const clientOptions: Option<string>[] = [...new Map((projects.data ?? []).map((p) => [p.clientId, p.clientName])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const moduleOptions: Option<string>[] = [{ value: "projeto", label: "Projetos" }, { value: "cliente", label: "Clientes" }, { value: "adm", label: "Administrativo" }];
  const labelOf = (opts: Option<string>[], v?: string) => opts.find((o) => o.value === v)?.label ?? undefined;

  /** Em modo biblioteca, agrupa por projeto. */
  const groups: { key: string; code: string | null; title: string; rows: FileRow[] }[] = [];
  if (files) {
    if (library) {
      const map = new Map<string, FileRow[]>();
      files.forEach((f) => map.set(f.projectCode ?? "_", [...(map.get(f.projectCode ?? "_") ?? []), f]));
      [...map.entries()]
        .sort(([a], [b]) => (a === "_" ? 1 : b === "_" ? -1 : a.localeCompare(b)))
        .forEach(([code, rows]) => {
          const p = projects.data?.find((x) => x.code === code);
          groups.push({ key: code, code: code === "_" ? null : code, title: code === "_" ? "Sem projeto (clientes e administrativo)" : (p?.title ?? code), rows });
        });
    } else groups.push({ key: "all", code: null, title: "", rows: files });
  }

  const body = () => {
    if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
    if (query.isLoading || !files)
      return view === "grade" ? (
        <div className="grid grid-cols-1 gap-3 p-4 min-[480px]:grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex h-36 flex-col gap-2 rounded-lg border border-line bg-surface p-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <DataTable rows={undefined} isLoading columns={columns} getRowId={(f: FileRow) => f.id} />
      );
    if (!files.length && emptyState !== undefined) return <>{emptyState}</>;
    if (!files.length)
      return (
        <EmptyState
          icon="files"
          title={hasFilters ? "Nenhum arquivo encontrado" : "Nenhum arquivo por aqui"}
          description={hasFilters ? "Ajuste a busca ou limpe os filtros para ver outros arquivos." : canUpload ? "Arraste arquivos para a área acima para guardar briefings, entregas e materiais do cliente com histórico de versões." : isFreelancer ? "Quando a Draw liberar materiais de apoio, eles aparecem aqui." : "Ainda não há arquivos enviados."}
          secondaryAction={hasFilters ? { label: "Limpar filtros", onClick: clearFilters } : undefined}
        />
      );
    return (
      <div className="divide-y divide-line">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.title || "Arquivos"}>
            {library && (
              <header className="sticky top-0 z-[5] flex h-9 items-center gap-2 border-b border-line bg-surface-2 px-4 text-sm">
                <Icon name="project" size="sm" className="text-fg-subtle" />
                {g.code ? (
                  <Link href={`/projetos/${g.code}?aba=arquivos`} className="font-mono text-xs text-accent hover:underline">{g.code}</Link>
                ) : null}
                <span className="min-w-0 flex-1 truncate font-medium text-fg">{g.title}</span>
                <span className="text-xs tabular-nums text-fg-subtle">{g.rows.length}</span>
              </header>
            )}
            {view === "grade" ? (
              <FileGrid files={g.rows} onOpen={(f) => setUrl({ arquivo: f.id })} menuFor={menuFor} />
            ) : (
              <DataTable rows={g.rows} columns={columns} getRowId={(f) => f.id} onRowClick={(f) => setUrl({ arquivo: f.id })} pageSize={50} initialSort={{ id: "date", dir: "desc" }} />
            )}
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {canUpload && !bare && (
        <div className="p-3 md:p-4">
          <DropZone compact={!!files?.length} onFiles={setPending} />
        </div>
      )}
      {!bare && <div className="flex flex-wrap items-center gap-2 border-y border-line bg-surface px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 max-md:flex-nowrap max-md:overflow-x-auto max-md:scrollbar-none">
          <SearchInput value={url.q} onChange={(v) => setUrl({ q: v })} placeholder="Buscar arquivo…" />
          <Combobox options={categoryOptions} value={url.cat ?? null} onChange={(v) => setUrl({ cat: v ?? undefined })} clearable contentClassName="w-52" trigger={<FilterChip label="Categoria" value={labelOf(categoryOptions, url.cat)} onClear={() => setUrl({ cat: undefined })} />} />
          {library && (
            <>
              <Combobox options={projectOptions} value={url.projeto ?? null} onChange={(v) => setUrl({ projeto: v ?? undefined })} clearable contentClassName="w-72" searchPlaceholder="Buscar projeto…" trigger={<FilterChip label="Projeto" value={labelOf(projectOptions, url.projeto)} onClear={() => setUrl({ projeto: undefined })} />} />
              <Combobox options={clientOptions} value={url.cliente ?? null} onChange={(v) => setUrl({ cliente: v ?? undefined })} clearable contentClassName="w-64" searchPlaceholder="Buscar cliente…" trigger={<FilterChip label="Cliente" value={labelOf(clientOptions, url.cliente)} onClear={() => setUrl({ cliente: undefined })} />} />
              {!isFreelancer && <Combobox options={moduleOptions} value={url.modulo ?? null} onChange={(v) => setUrl({ modulo: v ?? undefined })} clearable contentClassName="w-48" trigger={<FilterChip label="Módulo" value={labelOf(moduleOptions, url.modulo)} onClear={() => setUrl({ modulo: undefined })} />} />}
            </>
          )}
          <ClearFiltersButton show={hasFilters} onClick={clearFilters} />
        </div>
        <SegmentedControl
          aria-label="Visualização dos arquivos"
          value={view}
          onChange={(v) => setUrl({ vista: v })}
          options={[
            { value: "lista", label: "Lista", icon: "viewList", iconOnly: true },
            { value: "grade", label: "Grade", icon: "viewGrid", iconOnly: true },
          ]}
        />
      </div>}
      {body()}

      {pending && <UploadDialog files={pending} onClose={() => setPending(null)} target={{ projectId, folderId }} askProject={!projectId && !folderId} defaultCategory={defaultCategory} />}
      <FileDetailSheet file={opened} onClose={() => setUrl({ arquivo: undefined })} showProject={library} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir arquivo?"
        description={`"${toDelete?.name}" e todas as suas versões deixarão de aparecer. O histórico registra a exclusão.`}
        confirmLabel="Excluir arquivo"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}
