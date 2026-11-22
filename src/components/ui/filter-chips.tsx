"use client";
import { useState } from "react";
import type { Option } from "./select";
import { FilterSelect } from "./filter-select";
import { FilterChip } from "./page";
import { Popover, PopoverContent, PopoverTrigger } from "./overlay";
import { Input } from "./input";
import { Button } from "./button";
import type { IconName } from "./icon";
import { monthTitle } from "@/lib/format-month";

/** Variante com `undefined` como "sem filtro" — delega ao FilterSelect (fonte única do visual). */
export function FilterSelectChip<V extends string>({ label, icon, value, onChange, options, searchPlaceholder }: { label: string; icon?: IconName; value: V | undefined; onChange: (v: V | undefined) => void; options: Option<V>[]; searchPlaceholder?: string }) {
  return <FilterSelect label={label} icon={icon} options={options} value={value ?? null} onChange={(v) => onChange(v ?? undefined)} searchPlaceholder={searchPlaceholder} />;
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
