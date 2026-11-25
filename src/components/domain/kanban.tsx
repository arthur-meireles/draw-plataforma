"use client";
/**
 * Kanban genérico com dnd-kit: colunas = etapas fixas. Atualização otimista (10.5):
 * a tela move o item na hora e chama `onMove`; se falhar, o pai invalida e o item volta.
 * No celular mostra UMA coluna por vez com seletor de etapa (10.6).
 * Movimento: cartão erguido (escala + inclinação), coluna-alvo com borda em gradiente, lugar tracejado onde o
 * cartão vai cair (inclusive entre colunas), assentamento com anel de destaque ao soltar e entrada escalonada.
 */
import {
  DndContext,
  DragOverlay,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { IconButton, KanbanSkeleton, useEntrance, useReducedMotion } from "@/components/ui";

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

type Override<K> = { column: K; position: number };

function SortableCard({ id, disabled, settling, enter, children }: { id: string; disabled?: boolean; settling?: boolean; enter?: { className?: string; style?: React.CSSProperties }; children: (dragging: boolean) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("touch-manipulation rounded-lg", isDragging && "motion-placeholder")} {...attributes} {...listeners}>
      <div className={cn("rounded-lg", settling && "motion-settle", enter?.className)} style={enter?.style}>
        {children(isDragging)}
      </div>
    </div>
  );
}

function Column<T, K extends string>({ column, items, props, count, className, over, settledId, enter }: { column: KanbanColumn<K>; items: T[]; props: KanbanProps<T, K>; count: number; className?: string; over?: boolean; settledId: string | null; enter: ReturnType<typeof useEntrance> }) {
  const { setNodeRef } = useDroppable({ id: `col:${column.key}`, disabled: column.locked });
  return (
    <section aria-label={column.label} data-over={over || undefined} className={cn("motion-drop-target flex w-column shrink-0 flex-col rounded-lg bg-layer/70 max-md:w-full", className)}>
      <header className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
        {column.icon}
        <h3 className="truncate font-display text-sm font-semibold text-fg">{column.label}</h3>
        <span className="pl-1 text-xs tabular-nums text-fg-subtle">{count}</span>
        <span className="flex-1" />
        {props.onAdd && !column.locked && <IconButton icon="add" label={`Adicionar em ${column.label}`} size="xs" onClick={() => props.onAdd!(column.key)} />}
      </header>
      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 pt-1 scrollbar-thin">
        <SortableContext items={items.map(props.getId)} strategy={verticalListSortingStrategy}>
          {items.map((item) => {
            const id = props.getId(item);
            return (
              <SortableCard key={id} id={id} settling={settledId === id} enter={enter(id)} disabled={props.canDrag ? !props.canDrag(item) : false}>
                {(dragging) => props.renderCard(item, { dragging })}
              </SortableCard>
            );
          })}
        </SortableContext>
        {!items.length && <p className="rounded-md border border-dashed border-line-strong px-3 py-6 text-center text-xs text-fg-placeholder">{column.locked ? (column.lockedHint ?? "Sem itens") : (props.emptyColumnText ?? "Arraste para cá")}</p>}
        {column.footer}
      </div>
    </section>
  );
}

const dropSideEffects = defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } });
const dropAnimation: DropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.34, 1.2, 0.64, 1)",
  sideEffects: (args) => {
    // o cartão erguido desfaz escala/inclinação enquanto voa para o lugar
    args.dragOverlay.node.setAttribute("data-dropping", "");
    return dropSideEffects(args);
  },
};

export function Kanban<T, K extends string>(props: KanbanProps<T, K>) {
  const { columns, items, getId, getColumn, getPosition, renderCard, onMove, isLoading } = props;
  const reduced = useReducedMotion();
  const enter = useEntrance();
  const [local, setLocal] = useState<T[]>(items ?? []);
  const [activeId, setActiveId] = useState<string | null>(null);
  // posição provisória do cartão arrastado (move o lugar tracejado entre colunas) e do recém-solto até o pai atualizar
  const [overrides, setOverrides] = useState<Record<string, Override<K>>>({});
  const [settledId, setSettledId] = useState<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [mobileCol, setMobileCol] = useState<K>(props.mobileColumn ?? columns[0]?.key);

  const dragging = useRef(false);
  dragging.current = !!activeId;
  useEffect(() => {
    if (!activeId) setLocal(items ?? []);
  }, [items, activeId]);
  useEffect(() => {
    // itens novos do pai já refletem o movimento: descarta posições provisórias
    if (!dragging.current) setOverrides({});
  }, [items]);
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colOf = (i: T) => overrides[getId(i)]?.column ?? getColumn(i);
  const posOf = (i: T) => overrides[getId(i)]?.position ?? getPosition(i);

  const byColumn = useMemo(() => {
    const map = new Map<K, T[]>();
    columns.forEach((c) => map.set(c.key, []));
    local.forEach((i) => map.get(overrides[getId(i)]?.column ?? getColumn(i))?.push(i));
    const pos = (i: T) => overrides[getId(i)]?.position ?? getPosition(i);
    map.forEach((arr) => arr.sort((a, b) => pos(a) - pos(b)));
    return map;
  }, [local, columns, getColumn, getPosition, getId, overrides]);

  const active = activeId ? local.find((i) => getId(i) === activeId) : null;
  const overColumn = active ? colOf(active) : null;

  /** Coluna e índice-alvo a partir do elemento sob o cursor. */
  const target = (overId: string): { column: K; index: number } | null => {
    if (overId.startsWith("col:")) {
      const column = overId.slice(4) as K;
      return { column, index: (byColumn.get(column) ?? []).length };
    }
    const overItem = local.find((i) => getId(i) === overId);
    if (!overItem) return null;
    const column = colOf(overItem);
    return { column, index: (byColumn.get(column) ?? []).findIndex((i) => getId(i) === overId) };
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    if (!e.over) return;
    const item = local.find((i) => getId(i) === e.active.id);
    if (!item) return;
    const t = target(String(e.over.id));
    if (!t || t.column === colOf(item)) return;
    const col = columns.find((c) => c.key === t.column);
    if (col?.locked && t.column !== getColumn(item)) return;
    // entra na coluna-alvo logo antes do cartão sob o cursor (ou no fim)
    const list = (byColumn.get(t.column) ?? []).filter((i) => getId(i) !== getId(item));
    const after = list[t.index];
    const before = list[t.index - 1];
    const position = after ? posOf(after) - (before ? (posOf(after) - posOf(before)) / 2 : 1) : before ? posOf(before) + 1 : 0;
    setOverrides((o) => ({ ...o, [getId(item)]: { column: t.column, position } }));
  };

  const cancel = () => {
    setActiveId(null);
    setOverrides({});
  };

  const onDragEnd = (e: DragEndEvent) => {
    const item = local.find((i) => getId(i) === e.active.id);
    if (!item || !e.over) return cancel();
    const t = target(String(e.over.id));
    if (!t) return cancel();
    const { column, index: targetIndex } = t;
    const col = columns.find((c) => c.key === column);
    if (col?.locked && column !== getColumn(item)) return cancel();
    const siblings = (byColumn.get(column) ?? []).filter((i) => getId(i) !== getId(item));
    const before = siblings[targetIndex - 1];
    const after = siblings[targetIndex];
    const position = before && after ? (getPosition(before) + getPosition(after)) / 2 : before ? getPosition(before) + 1000 : after ? getPosition(after) - 1000 : 0;
    setActiveId(null);
    if (column === getColumn(item) && Math.abs(position - getPosition(item)) < 0.0001) {
      setOverrides({});
      return;
    }
    // mantém o cartão no lugar novo até o pai devolver os itens atualizados (sem "pulo" de volta)
    setOverrides({ [getId(item)]: { column, position } });
    if (!reduced) {
      setSettledId(getId(item));
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => setSettledId(null), 700);
    }
    onMove(item, { column, position });
  };

  if (isLoading) return <KanbanSkeleton columns={Math.min(4, columns.length)} />;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={cancel}>
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
          <Column key={c.key} column={c} items={byColumn.get(c.key) ?? []} count={byColumn.get(c.key)?.length ?? 0} props={props} over={overColumn === c.key} settledId={settledId} enter={enter} className={cn(mobileCol !== c.key && "max-md:hidden")} />
        ))}
      </div>
      <DragOverlay dropAnimation={reduced ? null : dropAnimation}>
        {active ? <div className="motion-lift rounded-lg shadow-overlay">{renderCard(active, { dragging: true })}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
