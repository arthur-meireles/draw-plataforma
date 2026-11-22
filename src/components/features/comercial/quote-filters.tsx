"use client";
import { Avatar, ClearFiltersButton, FilterSelect, SearchInput, Toolbar, type Option } from "@/components/ui";
import { quoteStageOptions } from "@/components/domain";
import { useClientOptions, useInternalPeople, useProjectTypes } from "@/data/hooks";
import { PERIOD_OPTIONS, type useQuoteFilters } from "./use-quotes";

/** Barra de filtros do funil (RF-M3-06): etapa, cliente, responsável, tipo e período. */
export function QuoteFiltersBar({ filters: f, end }: { filters: ReturnType<typeof useQuoteFilters>; end?: React.ReactNode }) {
  const clients = useClientOptions();
  const people = useInternalPeople();
  const types = useProjectTypes();
  const { state, set } = f;
  const clientOpts: Option[] = (clients.data ?? []).map((c) => ({ value: c.id, label: c.tradeName }));
  const ownerOpts: Option[] = (people.data ?? []).map((u) => ({ value: u.id, label: u.name, leading: <Avatar name={u.name} color={u.color} size="xs" /> }));
  const typeOpts: Option[] = (types.data ?? []).map((t) => ({ value: t.id, label: t.name }));
  return (
    <Toolbar end={end}>
      <SearchInput value={state.q ?? ""} onChange={(q) => set({ q })} placeholder="Buscar cotação ou cliente…" className="sm:w-56" />
      <FilterSelect label="Etapa" icon="stageOpen" options={quoteStageOptions()} value={state.etapa} onChange={(v) => set({ etapa: v ?? undefined })} />
      <FilterSelect label="Cliente" icon="client" options={clientOpts} value={state.cliente} onChange={(v) => set({ cliente: v ?? undefined })} />
      <FilterSelect label="Responsável" icon="user" options={ownerOpts} value={state.resp} onChange={(v) => set({ resp: v ?? undefined })} />
      <FilterSelect label="Tipo" icon="tag" options={typeOpts} value={state.tipo} onChange={(v) => set({ tipo: v ?? undefined })} />
      <FilterSelect label="Período" icon="date" options={PERIOD_OPTIONS} value={state.periodo} onChange={(v) => set({ periodo: v ?? undefined })} />
      <ClearFiltersButton show={f.filterCount > 0} onClick={f.clear} />
    </Toolbar>
  );
}
