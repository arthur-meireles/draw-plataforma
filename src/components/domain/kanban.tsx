"use client";
/**
 * Kanban genérico com dnd-kit: colunas = etapas fixas. Atualização otimista (10.5):
 * a tela move o item na hora e chama `onMove`; se falhar, o pai invalida e o item volta.
 * No celular mostra UMA coluna por vez com seletor de etapa (10.6).
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { IconButton, Skeleton } from "@/components/ui";

export interface KanbanColumn<K extends string> {
  key: K;
  label: string;
  icon?: React.ReactNode;
  /** Coluna não aceita soltar (ex.: "Concluído" exige ação explícita). */
  locked?: boolean;
  lockedHint?: string;
  footer?: React.ReactNode;
}

export interface KanbanProps<T, K extends string> {
  columns: KanbanColumn<K>[];
  items: T[] | undefined;
  getId: (item: T) => string;
  getColumn: (item: T) => K;
  getPosition: (item: T) => number;
  renderCard: (item: T, state: { dragging: boolean }) => React.ReactNode;
  onMove: (item: T, to: { column: K; position: number }) => void;
  onAdd?: (column: K) => void;
  canDrag?: (item: T) => boolean;
  isLoading?: boolean;
  /** Texto para coluna vazia. */
  emptyColumnText?: string;
  /** Coluna inicial no celular. */
  mobileColumn?: K;
}

function SortableCard({ id, disabled, children }: { id: string; disabled?: boolean; children: (dragging: boolean) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("touch-manipulation", isDragging && "opacity-40")} {...attributes} {...listeners}>
      {children(isDragging)}
    </div>
  );
}

function Column<T, K extends string>({ column, items, props, count, className }: { column: KanbanColumn<K>; items: T[]; props: KanbanProps<T, K>; count: number; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.key}`, disabled: column.locked });
  return (
    <section aria-label={column.label} className={cn("flex w-column shrink-0 flex-col rounded-lg bg-layer/70 max-md:w-full", isOver && !column.locked && "ring-2 ring-accent/40", className)}>
      <header className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
        {column.icon}
        <h3 className="truncate text-sm font-medium text-fg">{column.label}</h3>
        <span className="pl-1 text-xs tabular-nums text-fg-subtle">{count}</span>
        <span className="flex-1" />
        {props.onAdd && !column.locked && <IconButton icon="add" label={`Adicionar em ${column.label}`} size="xs" onClick={() => props.onAdd!(column.key)} />}
      </header>
      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 pt-1 scrollbar-thin">
        <SortableContext items={items.map(props.getId)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableCard key={props.getId(item)} id={props.getId(item)} disabled={props.canDrag ? !props.canDrag(item) : false}>
              {(dragging) => props.renderCard(item, { dragging })}
            </SortableCard>
          ))}
        </SortableContext>
        {!items.length && <p className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-xs text-fg-placeholder">{column.locked ? (column.lockedHint ?? "Sem itens") : (props.emptyColumnText ?? "Arraste para cá")}</p>}
        {column.footer}
      </div>
    </section>
  );
}

export function Kanban<T, K extends string>(props: KanbanProps<T, K>) {
  const { columns, items, getId, getColumn, getPosition, renderCard, onMove, isLoading } = props;
  const [local, setLocal] = useState<T[]>(items ?? []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileCol, setMobileCol] = useState<K>(props.mobileColumn ?? columns[0]?.key);

  useEffect(() => {
    if (!activeId) setLocal(items ?? []);
  }, [items, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byColumn = useMemo(() => {
    const map = new Map<K, T[]>();
    columns.forEach((c) => map.set(c.key, []));
    local.forEach((i) => map.get(getColumn(i))?.push(i));
    map.forEach((arr) => arr.sort((a, b) => getPosition(a) - getPosition(b)));
    return map;
  }, [local, columns, getColumn, getPosition]);

  const active = activeId ? local.find((i) => getId(i) === activeId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const item = local.find((i) => getId(i) === e.active.id);
    if (!item || !e.over) return;
    const overId = String(e.over.id);
    let column: K;
    let targetIndex: number;
    if (overId.startsWith("col:")) {
      column = overId.slice(4) as K;
      targetIndex = (byColumn.get(column) ?? []).length;
    } else {
      const overItem = local.find((i) => getId(i) === overId);
      if (!overItem) return;
      column = getColumn(overItem);
      targetIndex = (byColumn.get(column) ?? []).findIndex((i) => getId(i) === overId);
    }
    const col = columns.find((c) => c.key === column);
    if (col?.locked && column !== getColumn(item)) return;
    const siblings = (byColumn.get(column) ?? []).filter((i) => getId(i) !== getId(item));
    const before = siblings[targetIndex - 1];
    const after = siblings[targetIndex];
    const position = before && after ? (getPosition(before) + getPosition(after)) / 2 : before ? getPosition(before) + 1000 : after ? getPosition(after) - 1000 : 0;
    if (column === getColumn(item) && Math.abs(position - getPosition(item)) < 0.0001) return;
    onMove(item, { column, position });
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-hidden p-3 md:p-4">
        {columns.slice(0, 4).map((c) => (
          <div key={c.key} className="w-column shrink-0 space-y-2 rounded-lg bg-layer/70 p-2 max-md:w-full">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      {/* celular: seletor de coluna */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2 scrollbar-none md:hidden">
        {columns.map((c) => (
          <button key={c.key} type="button" onClick={() => setMobileCol(c.key)} className={cn("flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs", mobileCol === c.key ? "border-accent bg-accent-subtle text-accent" : "border-line text-fg-subtle")}>
            {c.label}
            <span className="tabular-nums opacity-70">{byColumn.get(c.key)?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-3 scrollbar-thin md:p-4 max-md:pb-24">
        {columns.map((c) => (
          <Column key={c.key} column={c} items={byColumn.get(c.key) ?? []} count={byColumn.get(c.key)?.length ?? 0} props={props} className={cn(mobileCol !== c.key && "max-md:hidden")} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.32,0.72,0,1)" }}>{active ? <div className="rotate-[1.5deg] shadow-overlay rounded-lg">{renderCard(active, { dragging: true })}</div> : null}</DragOverlay>
    </DndContext>
  );
}
