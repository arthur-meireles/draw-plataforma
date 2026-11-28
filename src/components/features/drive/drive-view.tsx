"use client";
/**
 * Drive (RF-M7-03): árvore de pastas da Draw. Local na URL (?pasta=), pastas primeiro e depois os arquivos
 * do local (FileManager). Arrastar e soltar para enviar; pastas virtuais por cliente e projeto em 01. Projetos.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { Button, Callout, ConfirmDialog, ErrorState, Fab, Icon, IconButton, PageBody, PageHeader, SearchInput, SegmentedControl, Skeleton, Toolbar, type MenuItem } from "@/components/ui";
import { FileManager, type FileRow } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { driveApi, PROJECTS_ROOT, type DriveFolder } from "@/data/services";
import { cn } from "@/lib/cn";
import { useUrlState } from "@/lib/use-url-state";
import { DriveEmpty } from "./drive-empty";
import { DriveSidebar, driveHref } from "./drive-sidebar";
import { FolderFormDialog, type FolderFormTarget } from "./folder-form-dialog";
import { FolderItem } from "./folder-item";
import { MoveFileDialog } from "./move-file-dialog";
import { TrashSheet } from "./trash-sheet";

export function DriveView() {
  const { canWriteAll, isFreelancer } = usePermissions();
  const [url, setUrl] = useUrlState({ pasta: undefined as string | undefined, q: "", vista: "grade", arquivo: undefined as string | undefined });
  const location = useApiQuery(["drive", "location", url.pasta ?? null], () => driveApi.location(url.pasta ?? null));
  const loc = location.data;
  const view = url.vista === "lista" ? "lista" : "grade";

  const [pending, setPending] = useState<File[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState<{ open: boolean; target: FolderFormTarget }>({ open: false, target: { parentId: null } });
  const [toDelete, setToDelete] = useState<DriveFolder | null>(null);
  const [deleteError, setDeleteError] = useState<string>();
  const [toMove, setToMove] = useState<FileRow | null>(null);
  const [trash, setTrash] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const remove = useApiMutation((id: string) => driveApi.removeFolder(id), {
    success: "Pasta excluída",
    onSuccess: () => setToDelete(null),
    onError: (e) => setDeleteError(e.message),
  });

  const q = url.q.trim().toLowerCase();
  const folders = (loc?.folders ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));
  const crumbs = loc?.breadcrumb ?? [];
  const parent = crumbs.length > 1 && !(isFreelancer && loc?.id === PROJECTS_ROOT) ? crumbs[crumbs.length - 2] : null;
  const activeId = loc?.id ?? null;
  const revealIds = crumbs.map((c) => c.id).filter((i): i is string => !!i);
  const projectCode = loc?.id?.startsWith("prj:") ? crumbs[crumbs.length - 1]?.name.split(" — ")[0] : undefined;
  const canUpload = !!loc?.canUpload;
  const manage = canWriteAll("files");

  const go = (id: string | null) => driveHref(id, view);
  const openPicker = () => input.current?.click();
  const queued = (list: File[]) => list.length && canUpload && setPending(list);

  const menuFor = (f: DriveFolder): MenuItem[] => {
    const editable = manage && f.kind === "pasta" && !f.systemKey;
    return [
      { label: "Abrir", icon: "folderOpen", href: go(f.id), hidden: !editable },
      { label: "Renomear…", icon: "edit", hidden: !editable, onSelect: () => setForm({ open: true, target: { parentId: loc?.id ?? null, folder: { id: f.id, name: f.name } } }) },
      {
        label: "Excluir pasta…",
        icon: "delete",
        destructive: true,
        separatorBefore: true,
        hidden: !editable,
        onSelect: () => {
          setDeleteError(undefined);
          setToDelete(f);
        },
      },
    ];
  };

  const skeleton = (
    <div className="p-3 md:p-4">
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[4.5rem]" />)}
      </div>
    </div>
  );

  const hasFiles = !!loc?.files;
  const emptyFolders = !!loc && !folders.length;

  const content = () => {
    if (location.error) return <ErrorState error={location.error} onRetry={() => location.refetch()} />;
    if (!loc) return skeleton;
    return (
      <>
        {loc.id === null && !q && folders.length > 0 && (
          <div className="px-3 pt-3 md:px-4 md:pt-4">
            <Callout icon="files" title="Como o Drive da Draw se organiza">
              As pastas numeradas seguem a estrutura da Draw. Em 01. Projetos, cada cliente tem uma pasta e cada projeto uma subpasta, montadas automaticamente. Os arquivos de um projeto ficam ligados a ele.
            </Callout>
          </div>
        )}
        {folders.length > 0 && (
          <section aria-label="Pastas" className="pb-1">
            {hasFiles && <h2 className="px-3 pt-3 text-2xs font-medium uppercase tracking-wide text-fg-subtle md:px-4">Pastas</h2>}
            {view === "grade" ? (
              <ul className="grid grid-cols-1 gap-3 p-3 min-[480px]:grid-cols-2 md:grid-cols-3 md:p-4 xl:grid-cols-4">
                {folders.map((f) => <FolderItem key={f.id} folder={f} href={go(f.id)} variant="grade" menu={menuFor(f)} />)}
              </ul>
            ) : (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {folders.map((f) => <FolderItem key={f.id} folder={f} href={go(f.id)} variant="lista" menu={menuFor(f)} />)}
              </ul>
            )}
          </section>
        )}
        {hasFiles && (
          <section aria-label="Arquivos">
            {folders.length > 0 && <h2 className="px-3 pt-3 text-2xs font-medium uppercase tracking-wide text-fg-subtle md:px-4">Arquivos</h2>}
            <FileManager
              bare
              defaultView="grade"
              projectId={loc.files?.projectId}
              folderId={loc.files?.folderId}
              pending={pending}
              onPendingChange={setPending}
              onMove={setToMove}
              defaultCategory={loc.files?.projectId ? "entrega" : "outro"}
              emptyState={emptyFolders ? <DriveEmpty location={loc} searching={!!q} onClearSearch={() => setUrl({ q: "" })} onNewFolder={loc.canCreateFolder ? () => openCreate() : undefined} onUpload={canUpload ? openPicker : undefined} /> : null}
            />
          </section>
        )}
        {!hasFiles && emptyFolders && <DriveEmpty location={loc} searching={!!q} onClearSearch={() => setUrl({ q: "" })} onNewFolder={loc.canCreateFolder ? () => openCreate() : undefined} />}
      </>
    );
  };

  function openCreate() {
    setForm({ open: true, target: { parentId: loc?.id ?? null } });
  }

  return (
    <>
      <PageHeader
        crumbs={[
          ...crumbs.map((c, i) => ({ label: c.name, href: i < crumbs.length - 1 ? go(c.id) : undefined, icon: i === 0 ? ("files" as const) : undefined })),
          ...(!loc ? [{ label: "Arquivos", icon: "files" as const }] : []),
        ]}
        actions={
          <>
            {projectCode && (
              <Button asChild size="sm" className="max-md:hidden">
                <Link href={`/projetos/${projectCode}?aba=arquivos`}>
                  <Icon name="externalLink" size="sm" />
                  Abrir projeto
                </Link>
              </Button>
            )}
            {loc?.canCreateFolder && (
              <Button size="sm" icon="folderAdd" onClick={openCreate} className="max-md:hidden">
                Nova pasta
              </Button>
            )}
            {canUpload && (
              <Button size="sm" variant="primary" icon="upload" onClick={openPicker} className="max-md:hidden">
                Enviar arquivos
              </Button>
            )}
            {manage && <IconButton icon="restore" label="Lixeira" onClick={() => setTrash(true)} />}
            {loc?.canCreateFolder && <IconButton icon="folderAdd" label="Nova pasta" onClick={openCreate} className="md:hidden" />}
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <DriveSidebar activeId={activeId} revealIds={revealIds} view={view} />
        <div
          className="relative flex min-w-0 flex-1 flex-col"
          onDragOver={(e) => {
            if (!canUpload || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            if (!canUpload) return;
            e.preventDefault();
            setDragging(false);
            queued([...e.dataTransfer.files]);
          }}
        >
          {parent && (
            <div className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-2 py-1 lg:hidden">
              <Button asChild variant="ghost" size="sm">
                <Link href={go(parent.id)}>
                  <Icon name="arrowLeft" size="sm" />
                  <span className="truncate">Voltar para {parent.name}</span>
                </Link>
              </Button>
            </div>
          )}
          <Toolbar end={<SegmentedControl aria-label="Visualização das pastas" value={view} onChange={(v) => setUrl({ vista: v })} options={[{ value: "grade", label: "Grade", icon: "viewGrid", iconOnly: true }, { value: "lista", label: "Lista", icon: "viewList", iconOnly: true }]} />}>
            <SearchInput value={url.q} onChange={(v) => setUrl({ q: v })} placeholder={loc?.files ? "Buscar…" : "Buscar pastas…"} />
            {projectCode && (
              <Button asChild size="sm" variant="ghost" className="md:hidden">
                <Link href={`/projetos/${projectCode}?aba=arquivos`}>
                  <Icon name="externalLink" size="sm" />
                  Abrir projeto
                </Link>
              </Button>
            )}
          </Toolbar>
          <PageBody padded={false} className={cn(dragging && "bg-accent-subtle/40")}>
            {content()}
          </PageBody>
          {dragging && (
            <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-subtle/70">
              <span className="flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-accent shadow-overlay">
                <Icon name="upload" size="md" />
                Solte para enviar a {crumbs[crumbs.length - 1]?.name}
              </span>
            </div>
          )}
        </div>
      </div>
      {canUpload && <Fab label="Enviar arquivos" icon="upload" onClick={openPicker} />}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          queued([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <FolderFormDialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} target={form.target} />
      <MoveFileDialog file={toMove} onClose={() => setToMove(null)} />
      <TrashSheet open={trash} onClose={() => setTrash(false)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir pasta?"
        description={`"${toDelete?.name}" será excluída. Só é possível excluir pastas vazias.`}
        confirmLabel="Excluir pasta"
        destructive
        loading={remove.isPending}
        error={deleteError}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  );
}
