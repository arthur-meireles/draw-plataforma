"use client";
/** Kanban do funil (RF-M3-01): arrastar entre etapas abertas; "Aprovada" exige aprovar proposta; "Perdida" exige motivo (RF-M3-05). */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui";
import { Kanban, StageIcon, type KanbanColumn } from "@/components/domain";
import { useApiMutation } from "@/data/hooks";
import { projectsApi, type QuoteItem } from "@/data/services";
import { QUOTE_STAGES } from "@/data/reference";
import type { QuoteStageKey } from "@/data/types";
import { QuoteCard } from "./quote-card";

const COLUMNS: KanbanColumn<QuoteStageKey>[] = QUOTE_STAGES.map((s) => ({
  key: s.key,
  label: s.key === "aprovada" ? "Aprovada (30 dias)" : s.label,
  icon: <StageIcon category={s.category} progress={s.category === "open" ? (s.order - 1) / 5 : undefined} />,
  lockedHint: s.key === "aprovada" ? "Aprovações dos últimos 30 dias aparecem aqui" : undefined,
}));

export function QuoteBoard({ items, isLoading, canMove }: { items: QuoteItem[] | undefined; isLoading?: boolean; canMove: boolean }) {
  const [overrides, setOverrides] = useState<Record<string, { column: QuoteStageKey; position: number }>>({});
  const [lost, setLost] = useState<QuoteItem | null>(null);

  // dados novos do servidor substituem a atualização otimista
  useEffect(() => setOverrides({}), [items]);

  const view = useMemo(() => items?.map((i) => (overrides[i.id] ? { ...i, column: overrides[i.id].column, position: overrides[i.id].position } : i)), [items, overrides]);

  const move = useApiMutation((a: { id: string; stageKey: QuoteStageKey; position: number }) => projectsApi.move(a.id, { stageKey: a.stageKey, position: a.position }), {
    success: false,
    onError: () => setOverrides({}),
  });
  const markLost = useApiMutation((a: { id: string; reason: string }) => projectsApi.markLost(a.id, a.reason), {
    success: "Cotação marcada como perdida",
    onSuccess: () => setLost(null),
  });

  return (
    <>
      <Kanban
        columns={COLUMNS}
        items={view}
        isLoading={isLoading}
        getId={(i) => i.id}
        getColumn={(i) => i.column}
        getPosition={(i) => i.position}
        mobileColumn="entrada"
        emptyColumnText="Nenhuma cotação"
        canDrag={(i) => canMove && i.status === "cotacao"}
        renderCard={(i, { dragging }) => <QuoteCard quote={i} dragging={dragging} />}
        onMove={(item, to) => {
          if (to.column === "aprovada") {
            toast.info("Para aprovar, abra o projeto e aprove uma proposta enviada.", { description: `${item.code} só vira projeto ativo com uma proposta aprovada.` });
            return;
          }
          if (to.column === "perdida") {
            setLost(item);
            return;
          }
          setOverrides((o) => ({ ...o, [item.id]: { column: to.column, position: to.position } }));
          move.mutate({ id: item.id, stageKey: to.column, position: to.position });
        }}
      />
      <ConfirmDialog
        key={lost?.id ?? "none"}
        open={!!lost}
        onOpenChange={(o) => !o && setLost(null)}
        title="Marcar cotação como perdida"
        description={lost ? `${lost.code} · ${lost.title}. As propostas enviadas serão marcadas como recusadas.` : undefined}
        confirmLabel="Marcar como perdida"
        destructive
        loading={markLost.isPending}
        reason={{ label: "Motivo da perda", required: true, placeholder: "Ex.: fechou com concorrente, orçamento cortado…" }}
        onConfirm={(reason) => lost && markLost.mutate({ id: lost.id, reason: reason ?? "" })}
      />
    </>
  );
}
