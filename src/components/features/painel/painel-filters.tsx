"use client";
/** Filtros do painel na barra: período, tipo de projeto e responsável (todos na URL). */
import { ClearFiltersButton, Combobox, FilterChip, Toolbar } from "@/components/ui";
import { useInternalPeople, useProjectTypes } from "@/data/hooks";
import { PERIOD_OPTIONS, periodDays, type PainelFilters } from "./use-indicators";

export function PainelFilterBar({ filters, onChange, showOwner = true, onlyPeriod }: { filters: PainelFilters; onChange: (patch: Partial<PainelFilters>) => void; showOwner?: boolean; onlyPeriod?: boolean }) {
  const types = useProjectTypes();
  const people = useInternalPeople();
  const days = String(periodDays(filters.periodo));
  const typeLabel = types.data?.find((x) => x.id === filters.tipo)?.name;
  const ownerLabel = people.data?.find((x) => x.id === filters.resp)?.name;
  return (
    <Toolbar>
      <Combobox options={PERIOD_OPTIONS} value={days} onChange={(v) => v && onChange({ periodo: v })} align="start" aria-label="Período" trigger={<FilterChip label="Período" icon="viewCalendar" active={days !== "90"} value={PERIOD_OPTIONS.find((o) => o.value === days)?.label} onClear={() => onChange({ periodo: "90" })} />} />
      {!onlyPeriod && <Combobox options={(types.data ?? []).map((x) => ({ value: x.id, label: x.name }))} value={filters.tipo} onChange={(v) => onChange({ tipo: v ?? undefined })} clearable aria-label="Tipo de projeto" trigger={<FilterChip label="Tipo de projeto" icon="project" value={typeLabel} onClear={() => onChange({ tipo: undefined })} />} />}
      {showOwner && !onlyPeriod && <Combobox options={(people.data ?? []).map((x) => ({ value: x.id, label: x.name }))} value={filters.resp} onChange={(v) => onChange({ resp: v ?? undefined })} clearable aria-label="Responsável" trigger={<FilterChip label="Responsável" icon="user" value={ownerLabel} onClear={() => onChange({ resp: undefined })} />} />}
      <ClearFiltersButton show={days !== "90" || !!filters.tipo || !!filters.resp} onClick={() => onChange({ periodo: "90", tipo: undefined, resp: undefined })} />
    </Toolbar>
  );
}
