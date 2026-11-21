"use client";
import { useState } from "react";
import { Combobox, type Option } from "./select";
import { FilterChip } from "./page";
import { Popover, PopoverContent, PopoverTrigger } from "./overlay";
import { Input } from "./input";
import { Button } from "./button";
import type { IconName } from "./icon";
import { monthTitle } from "@/lib/format-month";

/** Chip de filtro que abre uma lista pesquisável de opções. `value` vazio = sem filtro. */
export function FilterSelectChip<V extends string>({ label, icon, value, onChange, options, searchPlaceholder }: { label: string; icon?: IconName; value: V | undefined; onChange: (v: V | undefined) => void; options: Option<V>[]; searchPlaceholder?: string }) {
  const selected = options.find((o) => o.value === value);
  return (
    <Combobox
      options={options}
      value={value ?? null}
      onChange={(v) => onChange(v ?? undefined)}
      searchPlaceholder={searchPlaceholder}
      contentClassName="w-64"
      trigger={<FilterChip label={label} icon={icon} value={selected?.label} onClear={() => onChange(undefined)} />}
    />
  );
}

/** Chip de filtro de mês (yyyy-mm). */
export function MonthFilterChip({ label = "Mês", value, onChange }: { label?: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FilterChip label={label} icon="date" value={value ? monthTitle(value) : undefined} onClear={() => onChange(undefined)} />
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2 p-3">
        <Input type="month" aria-label="Escolher mês" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
          >
            Limpar
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
