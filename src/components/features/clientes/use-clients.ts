"use client";
import { useMemo } from "react";
import { useApiQuery } from "@/data/hooks";
import { clientsApi } from "@/data/services";
import { CLIENT_STATUS_LABEL } from "@/data/reference";
import type { ClientStatus } from "@/data/types";
import { useUrlState } from "@/lib/use-url-state";

export type ClientRow = Awaited<ReturnType<typeof clientsApi.list>>[number];
export type ClientDetail = Awaited<ReturnType<typeof clientsApi.get>>;

/** Filtros da listagem de clientes persistidos na URL (RF-M2-01). */
export function useClientFilters() {
  const [state, set, activeCount] = useUrlState<{ q?: string; grupo?: string; segmento?: string; status?: string }>({ q: undefined, grupo: undefined, segmento: undefined, status: undefined });
  const filters = useMemo(
    () => ({
      q: state.q,
      groupId: state.grupo,
      segment: state.segmento,
      status: state.status && state.status in CLIENT_STATUS_LABEL ? (state.status as ClientStatus) : undefined,
    }),
    [state],
  );
  const clear = () => set({ q: undefined, grupo: undefined, segmento: undefined, status: undefined });
  return { state, set, filters, filterCount: activeCount, clear };
}

export const useClients = (filters: ReturnType<typeof useClientFilters>["filters"]) => useApiQuery(["clients", "list", filters], () => clientsApi.list(filters));
export const useClientGroups = () => useApiQuery(["client-groups"], clientsApi.groups, { staleTime: 30_000 });
export const useClientSegments = () => useApiQuery(["client-segments"], clientsApi.segments, { staleTime: 30_000 });
export const useClient = (id: string) => useApiQuery(["clients", "detail", id], () => clientsApi.get(id), { retry: false });
