"use client";
import { ClearFiltersButton, FilterSelect, SearchInput, Toolbar, type Option } from "@/components/ui";
import { SPECIALTY_LABEL } from "@/data/reference";
import type { useFreelancerFilters } from "./use-freelancers";

const SPECIALTIES: Option[] = Object.entries(SPECIALTY_LABEL).map(([value, label]) => ({ value, label }));
const STATUSES: Option[] = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

/** Busca e filtros especialidade/status, na URL. */
export function FreelancerFiltersBar({ filters: f }: { filters: ReturnType<typeof useFreelancerFilters> }) {
  const { state, set } = f;
  return (
    <Toolbar>
      <SearchInput value={state.q ?? ""} onChange={(q) => set({ q })} placeholder="Buscar por nome ou e-mail…" className="sm:w-64 max-sm:w-44 max-sm:shrink-0" />
      <FilterSelect label="Especialidade" icon="tag" options={SPECIALTIES} value={state.esp} onChange={(v) => set({ esp: v ?? undefined })} />
      <FilterSelect label="Status" icon="stageOpen" options={STATUSES} value={state.status} onChange={(v) => set({ status: v ?? undefined })} />
      <ClearFiltersButton show={f.filterCount > 0} onClick={f.clear} />
    </Toolbar>
  );
}
