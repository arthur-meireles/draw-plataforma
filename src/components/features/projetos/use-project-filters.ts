"use client";
/** Filtros de projetos (RF-M4-09) persistidos na URL + consulta da lista com filtro de prazo (RF-M4-13). */
import { useMemo, useSyncExternalStore } from "react";
import { useApiQuery } from "@/data/hooks";
import { projectsApi, type ProjectFilters, type ProjectListItem } from "@/data/services";
import type { PriorityKey } from "@/data/types";
import { daysUntil } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import type { ViewMode } from "@/components/ui";

export const PROJECT_FILTER_DEFAULTS = { q: "", cliente: "", tipo: "", pessoa: "", prioridade: "", prazo: "", situacao: "", visao: "", mes: "" };
export type ProjectFilterState = typeof PROJECT_FILTER_DEFAULTS;

export type DueFilter = "atrasado" | "proximos" | "semana" | "mes";
export const SITUATION_OPTIONS = [
  { value: "parados", label: "Parados" },
  { value: "andamento", label: "Em andamento" },
];

export const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "atrasado", label: "Atrasados" },
  { value: "proximos", label: "Vencem em até 2 dias" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
];

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** Visão padrão: kanban a partir de 768 px, lista no celular (10.6). */
export function useDefaultView(): ViewMode {
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia("(min-width: 768px)").matches, () => true);
  return wide ? "kanban" : "lista";
}

export const matchesDue = (p: ProjectListItem, due: string) => {
  const d = daysUntil(p.dueAt);
  if (due === "atrasado") return p.isOverdue;
  if (d == null || p.isOverdue || p.pausedAt) return false; // projeto parado não gera alertas de prazo (RN-13)
  if (due === "proximos") return d <= 2;
  if (due === "semana") return d <= 7;
  if (due === "mes") return d <= 30;
  return true;
};

export function useProjectFilters() {
  const [state, set] = useUrlState(PROJECT_FILTER_DEFAULTS);
  const defaultView = useDefaultView();
  const view = (["lista", "kanban", "calendario", "gantt"].includes(state.visao) ? state.visao : defaultView) as ViewMode;
  const hasFilters = !!(state.q || state.cliente || state.tipo || state.pessoa || state.prioridade || state.prazo || state.situacao);
  const clear = () => set({ q: "", cliente: "", tipo: "", pessoa: "", prioridade: "", prazo: "", situacao: "" });
  return { state, set, view, setView: (v: ViewMode) => set({ visao: v }), hasFilters, clear };
}

/** Projetos ativos filtrados. `base` = sem o filtro de prazo (usado nos alertas). */
export function useActiveProjects(state: ProjectFilterState) {
  const [kind, id] = state.pessoa ? [state.pessoa.split(":")[0], state.pessoa.split(":").slice(1).join(":")] : [null, null];
  const api: ProjectFilters = {
    status: ["ativo"],
    q: state.q || undefined,
    clientId: state.cliente || undefined,
    projectTypeId: state.tipo || undefined,
    priority: (state.prioridade || undefined) as PriorityKey | undefined,
    memberUserId: kind === "user" ? id! : undefined,
    memberFreelancerId: kind === "freelancer" ? id! : undefined,
  };
  const query = useApiQuery(["projects", "list", api], () => projectsApi.list(api));
  const rows = useMemo(() => {
    let list = query.data;
    if (state.situacao) list = list?.filter((p) => (state.situacao === "parados" ? !!p.pausedAt : !p.pausedAt));
    if (state.prazo) list = list?.filter((p) => matchesDue(p, state.prazo));
    return list;
  }, [query.data, state.prazo, state.situacao]);
  return { query, base: query.data, rows };
}
