"use client";
/** Painel lateral do Drive (≥ 1024 px): árvore de pastas com o local atual destacado. */
import { Icon, Skeleton } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { driveApi, PROJECTS_ROOT } from "@/data/services";
import { usePermissions } from "@/components/layout/session";
import { FolderTree, type TreeFolder } from "./folder-tree";

/** Link para um local do Drive, mantendo a visão escolhida (grade é o padrão). */
export function driveHref(id: string | null, view: "grade" | "lista" = "grade") {
  const qs = new URLSearchParams();
  if (id) qs.set("pasta", id);
  if (view === "lista") qs.set("vista", "lista");
  const s = qs.toString();
  return s ? `/arquivos?${s}` : "/arquivos";
}

export function DriveSidebar({ activeId, revealIds, view = "grade" }: { activeId: string | null; revealIds: string[]; view?: "grade" | "lista" }) {
  const { isFreelancer } = usePermissions();
  const tree = useApiQuery(["drive", "tree"], () => driveApi.tree(), { staleTime: 30_000 });
  // Freelancer só enxerga 01. Projetos (a API não lista pastas reais para ele).
  const folders: TreeFolder[] | undefined = isFreelancer ? [{ id: PROJECTS_ROOT, parentId: null, name: "01. Projetos", systemKey: "projetos", restricted: false }] : tree.data;
  return (
    <aside aria-label="Pastas" className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface-2 lg:flex">
      <div className="flex h-9 shrink-0 items-center gap-2 px-3 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
        <Icon name="files" size="xs" />
        Pastas
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
        {!folders ? (
          <div className="space-y-1.5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : (
          <FolderTree folders={folders} activeId={activeId} hrefFor={(id) => driveHref(id, view)} lazyProjects revealIds={revealIds} />
        )}
      </div>
    </aside>
  );
}
