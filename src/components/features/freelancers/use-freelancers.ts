"use client";
import { useMemo } from "react";
import { useApiQuery } from "@/data/hooks";
import { freelancersApi } from "@/data/services";
import { SPECIALTY_LABEL } from "@/data/reference";
import type { FreelancerStatus, Specialty } from "@/data/types";
import { useUrlState } from "@/lib/use-url-state";

export type FreelancerRow = Awaited<ReturnType<typeof freelancersApi.list>>[number];
export type FreelancerDetail = Awaited<ReturnType<typeof freelancersApi.get>>;

/** Filtros da listagem de freelancers persistidos na URL (RF-M2-03). */
export function useFreelancerFilters() {
  const [state, set, count] = useUrlState<{ q?: string; esp?: string; status?: string }>({ q: undefined, esp: undefined, status: undefined });
  const filters = useMemo(
    () => ({
      q: state.q,
      specialty: state.esp && state.esp in SPECIALTY_LABEL ? (state.esp as Specialty) : undefined,
      status: state.status === "ativo" || state.status === "inativo" ? (state.status as FreelancerStatus) : undefined,
    }),
    [state],
  );
  return { state, set, filters, filterCount: count, clear: () => set({ q: undefined, esp: undefined, status: undefined }) };
}

export const useFreelancers = (filters: ReturnType<typeof useFreelancerFilters>["filters"]) => useApiQuery(["freelancers", "list", filters], () => freelancersApi.list(filters));
export const useFreelancer = (id: string) => useApiQuery(["freelancers", "detail", id], () => freelancersApi.get(id), { retry: false });
