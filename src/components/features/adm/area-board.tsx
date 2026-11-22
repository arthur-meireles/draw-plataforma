"use client";
import { Icon } from "@/components/ui";
import { Kanban, useTaskUpdate } from "@/components/domain";
import { ADM_AREAS } from "@/data/reference";
import type { TaskView } from "@/data/services";
import type { AdmArea } from "@/data/types";
import { AreaQuickAdd } from "./area-quick-add";
import { AdmTaskCard } from "./sprint-board";

/** Tarefa sem área conta em "Outros" (mesma regra de `metricsApi.companyOverview`). */
export const areaOf = (t: Pick<TaskView, "area">): AdmArea => t.area ?? "outros";

/** Quadro "Visão geral da empresa": uma coluna por área interna. Arrastar entre colunas muda a área. */
export function AreaBoard({ tasks, isLoading, canEdit, onOpen }: { tasks: TaskView[] | undefined; isLoading?: boolean; canEdit: boolean; onOpen: (t: TaskView) => void }) {
  const update = useTaskUpdate();
  return (
    <Kanban<TaskView, AdmArea>
      columns={ADM_AREAS.map((a) => ({ key: a.key, label: `${a.number}. ${a.label}`, icon: <Icon name="adm" size="sm" className="text-fg-subtle" />, footer: canEdit ? <AreaQuickAdd area={a.key} /> : undefined }))}
      items={tasks}
      isLoading={isLoading}
      getId={(t) => t.id}
      getColumn={areaOf}
      getPosition={(t) => t.position}
      canDrag={() => canEdit}
      renderCard={(t) => <AdmTaskCard task={t} onOpen={onOpen} showStatus />}
      onMove={(t, to) => update.mutate({ id: t.id, patch: { area: to.column, position: to.position } })}
      emptyColumnText="Nenhuma pendência"
    />
  );
}
