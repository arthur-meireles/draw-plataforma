"use client";
/**
 * Árvore de pastas do Drive. Usada no painel lateral (links) e no seletor "Mover para…" (seleção).
 * "01. Projetos" expande sob demanda para clientes e projetos (pastas virtuais) quando `lazyProjects`.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, Skeleton, type IconName } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { driveApi, PROJECTS_ROOT } from "@/data/services";
import { cn } from "@/lib/cn";

export interface TreeFolder {
  id: string;
  parentId: string | null;
  name: string;
  systemKey: string | null;
  restricted: boolean;
}

export interface FolderTreeProps {
  folders: TreeFolder[];
  activeId: string | null;
  /** Painel lateral: cada item é um link. */
  hrefFor?: (id: string) => string;
  /** Seletor: cada item é um botão. */
  onSelect?: (id: string) => void;
  /** Pastas que não podem ser escolhidas (mostra o motivo como dica). */
  disabledReason?: (f: TreeFolder) => string | undefined;
  /** Expande "01. Projetos" em clientes e projetos. */
  lazyProjects?: boolean;
  /** Ids que devem aparecer expandidos (ancestrais do local atual). */
  revealIds?: string[];
  className?: string;
}

interface Ctx extends Omit<FolderTreeProps, "folders" | "className" | "revealIds"> {
  all: TreeFolder[];
  open: Set<string>;
  toggle: (id: string) => void;
}

function Row({ ctx, id, name, depth, icon, hasChildren, disabled, disabledReason, mono }: { ctx: Ctx; id: string; name: string; depth: number; icon: IconName; hasChildren: boolean; disabled?: boolean; disabledReason?: string; mono?: boolean }) {
  const active = ctx.activeId === id;
  const expanded = ctx.open.has(id);
  const body = (
    <>
      <Icon name={icon} size="sm" className={cn("shrink-0", active ? "text-accent" : "text-fg-subtle")} />
      <span className={cn("min-w-0 flex-1 truncate", mono && "text-xs")}>{name}</span>
    </>
  );
  const cls = cn(
    "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent max-md:py-2.5",
    active ? "bg-accent-subtle font-medium text-accent" : "text-fg-muted hover:bg-layer-hover hover:text-fg",
    disabled && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-fg-muted",
  );
  return (
    <div role="treeitem" aria-selected={active} aria-expanded={hasChildren ? expanded : undefined} className="flex items-center" style={{ paddingLeft: `${depth * 0.875}rem` }} title={disabledReason}>
      {hasChildren ? (
        <button type="button" aria-label={`${expanded ? "Recolher" : "Expandir"} ${name}`} onClick={() => ctx.toggle(id)} className="flex size-6 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-layer-hover hover:text-fg max-md:size-9">
          <Icon name={expanded ? "chevronDown" : "chevronRight"} size="xs" />
        </button>
      ) : (
        <span className="size-6 shrink-0 max-md:size-9" aria-hidden />
      )}
      {ctx.hrefFor && !disabled ? (
        <Link href={ctx.hrefFor(id)} aria-current={active ? "page" : undefined} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" disabled={disabled} onClick={() => ctx.onSelect?.(id)} className={cls}>
          {body}
        </button>
      )}
    </div>
  );
}

/** Filhos virtuais (clientes de "01. Projetos" e projetos de cada cliente), carregados ao expandir. */
function VirtualChildren({ ctx, parentId, depth }: { ctx: Ctx; parentId: string; depth: number }) {
  const q = useApiQuery(["drive", "location", parentId], () => driveApi.location(parentId), { staleTime: 30_000 });
  if (q.isLoading) return <div className="space-y-1 py-1" style={{ paddingLeft: `${depth * 0.875 + 1.5}rem` }}><Skeleton className="h-6" /><Skeleton className="h-6" /></div>;
  if (q.error || !q.data) return <p className="py-1 pr-2 text-xs text-danger" style={{ paddingLeft: `${depth * 0.875 + 1.5}rem` }}>Não foi possível carregar.</p>;
  const items = q.data.folders.filter((f) => (parentId === PROJECTS_ROOT ? f.kind === "cliente" : true));
  if (!items.length) return <p className="py-1 pr-2 text-xs text-fg-subtle" style={{ paddingLeft: `${depth * 0.875 + 1.5}rem` }}>Nada por aqui ainda.</p>;
  return (
    <div role="group">
      {items.map((f) => (
        <VirtualNode key={f.id} ctx={ctx} id={f.id} name={f.name} depth={depth} kind={f.kind} />
      ))}
    </div>
  );
}

function VirtualNode({ ctx, id, name, depth, kind }: { ctx: Ctx; id: string; name: string; depth: number; kind: "pasta" | "cliente" | "projeto" }) {
  const isClient = kind === "cliente";
  return (
    <>
      <Row ctx={ctx} id={id} name={name} depth={depth} icon={isClient ? "client" : "project"} hasChildren={isClient} mono={kind === "projeto"} />
      {isClient && ctx.open.has(id) && <VirtualChildren ctx={ctx} parentId={id} depth={depth + 1} />}
    </>
  );
}

function Node({ ctx, folder, depth }: { ctx: Ctx; folder: TreeFolder; depth: number }) {
  const children = ctx.all.filter((f) => f.parentId === folder.id);
  const isProjects = folder.id === PROJECTS_ROOT && !!ctx.lazyProjects;
  const hasChildren = children.length > 0 || isProjects;
  const reason = ctx.disabledReason?.(folder);
  const active = ctx.activeId === folder.id;
  const icon: IconName = folder.restricted ? "folderLock" : active ? "folderOpen" : "folder";
  return (
    <>
      <Row ctx={ctx} id={folder.id} name={folder.name} depth={depth} icon={icon} hasChildren={hasChildren} disabled={!!reason} disabledReason={reason} />
      {hasChildren && ctx.open.has(folder.id) && (
        <div role="group">
          {children.map((c) => (
            <Node key={c.id} ctx={ctx} folder={c} depth={depth + 1} />
          ))}
          {isProjects && <VirtualChildren ctx={ctx} parentId={PROJECTS_ROOT} depth={depth + 1} />}
        </div>
      )}
    </>
  );
}

export function FolderTree({ folders, activeId, hrefFor, onSelect, disabledReason, lazyProjects, revealIds, className }: FolderTreeProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(revealIds ?? []));
  const key = (revealIds ?? []).join("|");
  useEffect(() => {
    if (!revealIds?.length) return;
    setOpen((prev) => (revealIds.every((i) => prev.has(i)) ? prev : new Set([...prev, ...revealIds])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const ctx: Ctx = { all: folders, activeId, hrefFor, onSelect, disabledReason, lazyProjects, open, toggle };
  const roots = folders.filter((f) => f.parentId === null);
  return (
    <div role="tree" aria-label="Pastas" className={cn("space-y-0.5", className)}>
      {roots.map((f) => (
        <Node key={f.id} ctx={ctx} folder={f} depth={0} />
      ))}
    </div>
  );
}
