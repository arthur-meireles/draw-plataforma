"use client";
import type { IconName } from "./icon";
import { Combobox, type Option } from "./select";
import { FilterChip } from "./page";

/** Filtro de toolbar: chip que abre uma lista pesquisável de opções (valor único, limpável). */
export function FilterSelect<V extends string>({ label, icon, options, value, onChange, searchPlaceholder, emptyText }: { label: string; icon?: IconName; options: Option<V>[]; value: V | null | undefined; onChange: (v: V | null) => void; searchPlaceholder?: string; emptyText?: string }) {
  const selected = options.find((o) => o.value === value);
  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      clearable
      align="start"
      searchPlaceholder={searchPlaceholder ?? `Buscar ${label.toLowerCase()}…`}
      emptyText={emptyText}
      contentClassName="min-w-60 w-auto"
      aria-label={`Filtrar por ${label.toLowerCase()}`}
      trigger={<FilterChip label={label} icon={icon} value={selected?.label} onClear={() => onChange(null)} />}
    />
  );
}
