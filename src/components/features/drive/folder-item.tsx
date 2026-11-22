"use client";
/** Pasta do Drive em grade (cartão) ou lista (linha): ícone por tipo, contagem, cadeado e menu de ações. */
import Link from "next/link";
import { Icon, RowActions, Tooltip, type IconName, type MenuItem } from "@/components/ui";
import type { DriveFolder } from "@/data/services";
import { cn } from "@/lib/cn";
import { plural, relative } from "@/lib/format";

export function folderIcon(f: Pick<DriveFolder, "kind" | "restricted">): IconName {
  if (f.kind === "cliente") return "client";
  if (f.kind === "projeto") return "project";
  return f.restricted ? "folderLock" : "folder";
}

const KIND_LABEL: Record<DriveFolder["kind"], string> = { pasta: "Pasta", cliente: "Cliente", projeto: "Projeto" };

/** Nome sem o código do projeto (o código aparece à parte). */
function displayName(f: DriveFolder) {
  return f.projectCode && f.name.startsWith(`${f.projectCode} — `) ? f.name.slice(f.projectCode.length + 3) : f.name;
}

function LockBadge() {
  return (
    <Tooltip content="Acesso restrito a alguns perfis">
      <span className="inline-flex text-fg-subtle">
        <Icon name="lock" size="xs" label="Acesso restrito" />
      </span>
    </Tooltip>
  );
}

interface Props {
  folder: DriveFolder;
  href: string;
  variant: "grade" | "lista";
  menu: MenuItem[];
}

export function FolderItem({ folder, href, variant, menu }: Props) {
  const count = plural(folder.count, "item", "itens");
  const icon = (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent", variant === "grade" ? "size-10 max-md:size-11" : "size-8")}>
      <Icon name={folderIcon(folder)} size={variant === "grade" ? "lg" : "md"} />
    </span>
  );
  const hasMenu = menu.some((m) => !m.hidden);

  if (variant === "grade") {
    return (
      <li className="group relative">
        <Link href={href} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 pr-10 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent max-md:min-h-16">
          {icon}
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-1.5">
              <span className="line-clamp-2 break-words text-sm font-medium leading-snug text-fg" title={folder.name}>{displayName(folder)}</span>
              {folder.restricted && <LockBadge />}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
              {folder.projectCode ? <span className="font-mono">{folder.projectCode}</span> : <span>{KIND_LABEL[folder.kind]}</span>}
              <span>·</span>
              <span>{count}</span>
            </span>
          </span>
        </Link>
        {hasMenu && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <RowActions items={menu} label={`Ações da pasta ${folder.name}`} />
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="group relative flex items-center hover:bg-layer-hover">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent max-md:min-h-14 md:px-4">
        {icon}
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {folder.projectCode && <span className="shrink-0 font-mono text-xs text-fg-subtle">{folder.projectCode}</span>}
          <span className="truncate text-sm font-medium text-fg">{displayName(folder)}</span>
          {folder.restricted && <LockBadge />}
        </span>
        <span className="w-20 shrink-0 text-xs text-fg-subtle max-md:hidden">{KIND_LABEL[folder.kind]}</span>
        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-fg-muted max-md:hidden">{count}</span>
        <span className="w-28 shrink-0 text-right text-xs text-fg-subtle max-lg:hidden">{folder.updatedAt ? relative(folder.updatedAt) : "—"}</span>
        <span className="shrink-0 text-xs tabular-nums text-fg-subtle md:hidden">{folder.count}</span>
      </Link>
      <div className="flex w-10 shrink-0 justify-center">{hasMenu && <RowActions items={menu} label={`Ações da pasta ${folder.name}`} />}</div>
    </li>
  );
}
