"use client";
/** Filtro em chip com lista pesquisável (single). Visual idêntico ao FilterChip; mostra o valor e "x" para limpar. */
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import { Combobox, type Option } from "./select";

const ChipTrigger = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; valueLabel?: string | null; icon?: IconName }>(function ChipTrigger({ label, valueLabel, icon, className, ...props }, ref) {
  return (
    <button ref={ref} type="button" className={cn("flex h-full items-center gap-1.5 px-2", className)} {...props}>
      {icon && <Icon name={icon} size="xs" />}
      <span>{label}</span>
      {valueLabel ? (
        <>
          <span className="opacity-50">:</span>
          <span className="max-w-32 truncate font-medium">{valueLabel}</span>
        </>
      ) : (
        <Icon name="chevronDown" size="xs" />
      )}
    </button>
  );
});

export function FilterSelect<V extends string>({ label, icon, options, value, onChange, searchPlaceholder, contentClassName }: { label: string; icon?: IconName; options: Option<V>[]; value: V | null | undefined; onChange: (v: V | null) => void; searchPlaceholder?: string; contentClassName?: string }) {
  const selected = options.find((o) => o.value === value);
  const active = !!value;
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center rounded-md border text-xs transition-colors max-md:h-9", active ? "border-accent-line bg-accent-subtle text-accent" : "border-dashed border-line-strong text-fg-subtle hover:border-solid hover:bg-layer-hover hover:text-fg")}>
      <Combobox
        options={options}
        value={value}
        onChange={onChange}
        searchPlaceholder={searchPlaceholder}
        contentClassName={cn("min-w-56 w-64", contentClassName)}
        trigger={<ChipTrigger label={label} valueLabel={selected?.label} icon={icon} />}
      />
      {active && (
        <button type="button" aria-label={`Limpar filtro ${label}`} onClick={() => onChange(null)} className="flex h-full items-center border-l border-accent-line px-1.5 hover:bg-accent/10">
          <Icon name="close" size="xs" />
        </button>
      )}
    </span>
  );
}
