"use client";
import { ClearFiltersButton, FilterSelect, SearchInput, Toolbar, type Option } from "@/components/ui";
import { CLIENT_STATUS_LABEL } from "@/data/reference";
import { useClientGroups, useClientSegments, type useClientFilters } from "./use-clients";

const STATUS_OPTIONS: Option[] = Object.entries(CLIENT_STATUS_LABEL).map(([value, label]) => ({ value, label }));

/** Busca (nome ou CNPJ) e filtros grupo/segmento/status, todos na URL. */
export function ClientFiltersBar({ filters: f }: { filters: ReturnType<typeof useClientFilters> }) {
  const groups = useClientGroups();
  const segments = useClientSegments();
  const { state, set } = f;
  const groupOpts: Option[] = (groups.data ?? []).map((g) => ({ value: g.id, label: g.name, description: `${g.clients} empresas` }));
  const segmentOpts: Option[] = (segments.data ?? []).map((s) => ({ value: s, label: s }));
  return (
    <Toolbar>
      <SearchInput value={state.q ?? ""} onChange={(q) => set({ q })} placeholder="Buscar por nome ou CNPJ…" className="sm:w-64 max-sm:w-44 max-sm:shrink-0" />
      <FilterSelect label="Grupo" icon="clients" options={groupOpts} value={state.grupo} onChange={(v) => set({ grupo: v ?? undefined })} />
      <FilterSelect label="Segmento" icon="tag" options={segmentOpts} value={state.segmento} onChange={(v) => set({ segmento: v ?? undefined })} />
      <FilterSelect label="Status" icon="stageOpen" options={STATUS_OPTIONS} value={state.status} onChange={(v) => set({ status: v ?? undefined })} />
      <ClearFiltersButton show={f.filterCount > 0} onClick={f.clear} />
    </Toolbar>
  );
}
