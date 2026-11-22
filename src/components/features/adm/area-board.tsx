"use client";
import { Icon } from "@/components/ui";
import type { TaskKanbanColumns } from "@/components/domain";
import { ADM_AREAS } from "@/data/reference";
import type { TaskView } from "@/data/services";
import type { AdmArea } from "@/data/types";
import { AreaQuickAdd } from "./area-quick-add";

/** Tarefa sem área conta em "Outros" (mesma regra de `metricsApi.companyOverview`). */
export const areaOf = (t: Pick<TaskView, "area">): AdmArea => t.area ?? "outros";

/** Colunas do quadro "Visão geral da empresa": uma por área interna. Arrastar entre colunas muda a área (RF-M6-05). */
export const areaKanbanColumns = (canEdit: boolean): TaskKanbanColumns => ({
  columns: ADM_AREAS.map((a) => ({ key: a.key, label: `${a.number}. ${a.label}`, icon: <Icon name="adm" size="sm" className="text-fg-subtle" />, footer: canEdit ? <AreaQuickAdd area={a.key} /> : undefined })),
  getColumn: areaOf,
  toPatch: (column, position) => ({ area: column as AdmArea, position }),
  emptyColumnText: "Nenhuma pendência",
});
