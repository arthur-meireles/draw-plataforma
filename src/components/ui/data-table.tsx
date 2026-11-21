"use client";
/**
 * Tabela de dados padrão: ordenação, seleção, paginação, linhas clicáveis,
 * skeleton/vazio/erro, e no celular vira lista de cartões (RF-X-05 / 10.6).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Checkbox } from "./select";
import { EmptyState, ErrorState, Skeleton } from "./display";
import { IconButton } from "./button";

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Valor para ordenação; sem ele a coluna não é ordenável. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  width?: string;
  /** Some em telas < lg (colunas secundárias). */
  hideBelow?: "md" | "lg" | "xl";
  /** Destaque no cartão mobile: "title" | "subtitle" | "meta" (padrão) | "hidden". */
  mobile?: "title" | "subtitle" | "meta" | "trailing" | "hidden";
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  error?: { message?: string; status?: number } | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  empty?: React.ComponentProps<typeof EmptyState>;
  pageSize?: number;
  initialSort?: { id: string; dir: "asc" | "desc" };
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Linha de rodapé (totais). */
  footer?: React.ReactNode;
  className?: string;
  dense?: boolean;
  rowClassName?: (row: T) => string | undefined;
}

const hideCls = { md: "max-md:hidden", lg: "max-lg:hidden", xl: "max-xl:hidden" };

export function DataTable<T>({ rows, columns, getRowId, isLoading, error, onRetry, onRowClick, rowHref, empty, pageSize = 25, initialSort, selectable, selected = [], onSelectedChange, footer, className, dense, rowClassName }: DataTableProps<T>) {
  const router = useRouter();
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!rows) return [];
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const allIds = sorted.map(getRowId);
  const allSelected = selectable && allIds.length > 0 && allIds.every((id) => selected.includes(id));

  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  if (isLoading || !rows) {
    return (
      <div className={cn("divide-y divide-line", className)} aria-busy>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24 max-md:hidden" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!rows.length) return <EmptyState {...(empty ?? { title: "Nada por aqui ainda" })} />;

  const activate = (row: T) => {
    if (rowHref) router.push(rowHref(row));
    else onRowClick?.(row);
  };
  const clickable = !!(onRowClick || rowHref);
  const mobileTitle = columns.find((c) => c.mobile === "title") ?? columns[0];
  const mobileSubtitle = columns.find((c) => c.mobile === "subtitle");
  const mobileTrailing = columns.find((c) => c.mobile === "trailing");
  const mobileMeta = columns.filter((c) => (c.mobile ?? "meta") === "meta" && c !== mobileTitle);

  return (
    <div className={className}>
      {/* desktop/tablet */}
      <div className="overflow-x-auto max-md:hidden scrollbar-thin">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="border-b border-line">
              {selectable && (
                <th className="w-10 px-4">
                  <Checkbox checked={allSelected ? true : selected.length ? "indeterminate" : false} onCheckedChange={(v) => onSelectedChange?.(v ? allIds : [])} />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.id === c.id;
                return (
                  <th
                    key={c.id}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("h-9 whitespace-nowrap px-3 text-left text-xs font-medium text-fg-subtle first:pl-4 last:pr-4", c.align === "right" && "text-right", c.align === "center" && "text-center", c.hideBelow && hideCls[c.hideBelow])}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => setSort(active ? (sort!.dir === "asc" ? { id: c.id, dir: "desc" } : null) : { id: c.id, dir: "asc" })}
                        className={cn("inline-flex items-center gap-1 hover:text-fg", active && "text-fg", c.align === "right" && "flex-row-reverse")}
                      >
                        {c.header}
                        <Icon name={active ? (sort!.dir === "asc" ? "arrowUp" : "arrowDown") : "sort"} size="xs" className={active ? "" : "opacity-40"} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const id = getRowId(row);
              return (
                <tr
                  key={id}
                  onClick={clickable ? () => activate(row) : undefined}
                  onKeyDown={clickable ? (e) => e.key === "Enter" && activate(row) : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  className={cn("border-b border-line last:border-0 transition-colors", clickable && "cursor-pointer hover:bg-layer-hover/60 focus-visible:bg-layer-hover", selected.includes(id) && "bg-accent-subtle/60", rowClassName?.(row))}
                >
                  {selectable && (
                    <td className="w-10 px-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.includes(id)} onCheckedChange={(v) => onSelectedChange?.(v ? [...selected, id] : selected.filter((x) => x !== id))} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.id} className={cn("px-3 first:pl-4 last:pr-4", dense ? "py-1.5" : "py-2.5", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.hideBelow && hideCls[c.hideBelow], c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer && <tfoot className="border-t border-line-strong bg-surface-2">{footer}</tfoot>}
        </table>
      </div>

      {/* celular: cartões */}
      <ul className="divide-y divide-line md:hidden">
        {visible.map((row) => {
          const id = getRowId(row);
          return (
            <li key={id}>
              <div
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? () => activate(row) : undefined}
                className={cn("flex gap-3 px-4 py-3", clickable && "active:bg-layer-hover", selected.includes(id) && "bg-accent-subtle/60")}
              >
                {selectable && (
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.includes(id)} onCheckedChange={(v) => onSelectedChange?.(v ? [...selected, id] : selected.filter((x) => x !== id))} />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium text-fg">{mobileTitle.cell(row)}</div>
                    {mobileTrailing && <div className="shrink-0 text-sm tabular-nums">{mobileTrailing.cell(row)}</div>}
                  </div>
                  {mobileSubtitle && <div className="text-xs text-fg-subtle">{mobileSubtitle.cell(row)}</div>}
                  {mobileMeta.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-subtle">
                      {mobileMeta.map((c) => (
                        <span key={c.id} className="inline-flex items-center gap-1">
                          {c.cell(row)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-xs text-fg-subtle">
          <span>
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} de {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <IconButton icon="chevronLeft" label="Página anterior" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)} />
            <span className="tabular-nums">
              {current + 1} / {pages}
            </span>
            <IconButton icon="chevronRight" label="Próxima página" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} />
          </div>
        </div>
      )}
    </div>
  );
}
