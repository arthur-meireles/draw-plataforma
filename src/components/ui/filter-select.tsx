"use client";
import { useState } from "react";
import { Icon } from "./icon";
import { Popover, PopoverAnchor, PopoverContent } from "./overlay";
import { FilterChip } from "./page";
import { cn } from "@/lib/cn";

/** Filtro de escolha única em formato de chip (valor vazio = sem filtro). */
export function FilterSelect<V extends string>({ label, value, options, onChange }: { label: string; value: V | "" | undefined; options: { value: V; label: string }[]; onChange: (v: V | "") => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span className="inline-flex shrink-0">
          <FilterChip label={label} value={current?.label} onClear={() => onChange("")} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} />
        </span>
      </PopoverAnchor>
      <PopoverContent className="w-60" onOpenAutoFocus={(e) => e.preventDefault()}>
        <ul role="listbox" aria-label={label}>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value === value ? "" : o.value);
                  setOpen(false);
                }}
                className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg-muted hover:bg-layer-hover hover:text-fg max-md:py-2.5", o.value === value && "text-fg")}
              >
                {o.label}
                {o.value === value && <Icon name="check" size="sm" className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
