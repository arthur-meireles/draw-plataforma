"use client";
import { ClearFiltersButton, FilterSelect, SearchInput, Toolbar, type Option } from "@/components/ui";
import { priorityOptions, usePeopleOptions } from "@/components/domain";
import { useClientOptions, useProjectTypes } from "@/data/hooks";
import { DUE_OPTIONS, type ProjectFilterState } from "./use-project-filters";

/** Barra de filtros de projetos (busca, cliente, tipo, pessoa, prioridade, prazo). `include` permite ocultar filtros. */
export function ProjectToolbar({ state, set, hasFilters, clear, hide = [], end }: { state: ProjectFilterState; set: (p: Partial<ProjectFilterState>) => void; hasFilters: boolean; clear: () => void; hide?: ("pessoa" | "prioridade" | "prazo")[]; end?: React.ReactNode }) {
  const clients = useClientOptions();
  const types = useProjectTypes();
  const people = usePeopleOptions();
  const clientOptions: Option[] = (clients.data ?? []).map((c) => ({ value: c.id, label: c.tradeName, description: c.legalName, keywords: [c.legalName] }));
  const typeOptions: Option[] = (types.data ?? []).map((t) => ({ value: t.id, label: t.name, description: `${t.codePrefix}-000` }));
  return (
    <Toolbar end={end}>
      <SearchInput value={state.q} onChange={(q) => set({ q })} placeholder="Buscar projeto, código ou cliente…" className="sm:w-72 max-md:w-56 max-md:shrink-0" />
      <FilterSelect label="Cliente" icon="client" options={clientOptions} value={state.cliente || null} onChange={(v) => set({ cliente: v ?? "" })} searchPlaceholder="Buscar cliente…" />
      <FilterSelect label="Tipo" icon="project" options={typeOptions} value={state.tipo || null} onChange={(v) => set({ tipo: v ?? "" })} />
      {!hide.includes("pessoa") && <FilterSelect label="Pessoa" icon="user" options={people.options} value={state.pessoa || null} onChange={(v) => set({ pessoa: v ?? "" })} searchPlaceholder="Buscar pessoa…" />}
      {!hide.includes("prioridade") && <FilterSelect label="Prioridade" icon="priority" options={priorityOptions} value={state.prioridade || null} onChange={(v) => set({ prioridade: v ?? "" })} />}
      {!hide.includes("prazo") && <FilterSelect label="Prazo" icon="due" options={DUE_OPTIONS} value={state.prazo || null} onChange={(v) => set({ prazo: v ?? "" })} />}
      <ClearFiltersButton show={hasFilters} onClick={clear} />
    </Toolbar>
  );
}
