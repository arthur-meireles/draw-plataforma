"use client";
/** Seleção: Combobox pesquisável (single/multi), SelectField, Checkbox, Switch, RadioGroup, SegmentedControl. */
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as RadioPrimitive from "@radix-ui/react-radio-group";
import { Command } from "cmdk";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import { Popover, PopoverContent, PopoverTrigger } from "./overlay";
import { controlBase, Field } from "./input";

export interface Option<V extends string = string> {
  value: V;
  label: string;
  description?: string;
  icon?: IconName;
  /** Elemento visual à esquerda (avatar, ícone de etapa). Tem prioridade sobre `icon`. */
  leading?: React.ReactNode;
  group?: string;
  disabled?: boolean;
  keywords?: string[];
}

interface ComboboxBase<V extends string> {
  options: Option<V>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Gatilho customizado (ex.: pill de propriedade). Sem ele, usa o controle padrão. */
  trigger?: React.ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  contentClassName?: string;
  /** Ação extra no rodapé (ex.: "Cadastrar cliente"). */
  footerAction?: { label: string; icon?: IconName; onSelect: () => void };
  align?: "start" | "end";
  "aria-describedby"?: string;
  "aria-label"?: string;
}

export interface ComboboxProps<V extends string> extends ComboboxBase<V> {
  value: V | null | undefined;
  onChange: (value: V | null) => void;
  clearable?: boolean;
}

function OptionsList<V extends string>({ options, isSelected, onPick, emptyText, searchPlaceholder, footerAction, multi }: { options: Option<V>[]; isSelected: (v: V) => boolean; onPick: (v: V) => void; emptyText: string; searchPlaceholder: string; footerAction?: ComboboxBase<V>["footerAction"]; multi?: boolean }) {
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <Command loop className="flex max-h-80 flex-col">
      {options.length > 6 && (
        <div className="flex items-center gap-2 border-b border-line px-2 pb-1.5 pt-1">
          <Icon name="search" size="sm" className="text-fg-subtle" />
          <Command.Input autoFocus placeholder={searchPlaceholder} className="h-7 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-placeholder" />
        </div>
      )}
      <Command.List className="overflow-y-auto p-0.5 scrollbar-thin">
        <Command.Empty className="px-2 py-6 text-center text-xs text-fg-subtle">{emptyText}</Command.Empty>
        {groups.map((g) => (
          <Command.Group key={g || "_"} heading={g || undefined} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle">
            {options
              .filter((o) => (o.group ?? "") === g)
              .map((o) => (
                <Command.Item
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  keywords={o.keywords}
                  disabled={o.disabled}
                  onSelect={() => onPick(o.value)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-muted outline-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-layer-hover data-[selected=true]:text-fg max-md:py-2.5"
                >
                  {multi && (
                    <span className={cn("flex size-4 items-center justify-center rounded-xs border", isSelected(o.value) ? "border-accent bg-accent text-accent-fg" : "border-line-strong")}>
                      {isSelected(o.value) && <Icon name="check" size="xs" />}
                    </span>
                  )}
                  {o.leading ?? (o.icon && <Icon name={o.icon} size="sm" className="text-fg-subtle" />)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.description && <span className="block truncate text-xs text-fg-subtle">{o.description}</span>}
                  </span>
                  {!multi && isSelected(o.value) && <Icon name="check" size="sm" className="text-accent" />}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
      {footerAction && (
        <button type="button" onClick={footerAction.onSelect} className="mt-0.5 flex items-center gap-2 border-t border-line px-2.5 py-2 text-sm text-accent hover:bg-layer-hover">
          <Icon name={footerAction.icon ?? "add"} size="sm" />
          {footerAction.label}
        </button>
      )}
    </Command>
  );
}

function DefaultTrigger({ children, invalid, disabled, id, className, placeholderShown, ...aria }: { children: React.ReactNode; invalid?: boolean; disabled?: boolean; id?: string; className?: string; placeholderShown?: boolean; "aria-describedby"?: string; "aria-label"?: string }) {
  return (
    <button
      type="button"
      id={id}
      disabled={disabled}
      data-invalid={invalid || undefined}
      className={cn(controlBase, "flex h-8 data-[invalid=true]:border-danger items-center gap-2 px-2.5 text-left max-md:h-11", placeholderShown && "text-fg-placeholder", className)}
      {...aria}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      <Icon name="chevronsUpDown" size="sm" className="text-fg-subtle" />
    </button>
  );
}

export function Combobox<V extends string>({ options, value, onChange, placeholder = "Selecionar", searchPlaceholder = "Buscar…", emptyText = "Nada encontrado", trigger, disabled, invalid, id, className, contentClassName, footerAction, clearable, align = "start", ...aria }: ComboboxProps<V>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <DefaultTrigger id={id} invalid={invalid} disabled={disabled} className={className} placeholderShown={!selected} {...aria}>
            {selected ? (
              <>
                {selected.leading ?? (selected.icon && <Icon name={selected.icon} size="sm" className="text-fg-subtle" />)}
                <span className="truncate text-fg">{selected.label}</span>
              </>
            ) : (
              placeholder
            )}
          </DefaultTrigger>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className={cn("w-[var(--radix-popover-trigger-width)] min-w-56 p-1", contentClassName)} onClick={(e) => e.stopPropagation()}>
        <OptionsList
          options={clearable && value ? [{ value: "__clear__" as V, label: "Limpar seleção", icon: "close" }, ...options] : options}
          isSelected={(v) => v === value}
          onPick={(v) => {
            onChange(v === "__clear__" ? null : v);
            setOpen(false);
          }}
          emptyText={emptyText}
          searchPlaceholder={searchPlaceholder}
          footerAction={footerAction && { ...footerAction, onSelect: () => { setOpen(false); footerAction.onSelect(); } }}
        />
      </PopoverContent>
    </Popover>
  );
}

export interface MultiComboboxProps<V extends string> extends ComboboxBase<V> {
  value: V[];
  onChange: (value: V[]) => void;
}

export function MultiCombobox<V extends string>({ options, value, onChange, placeholder = "Selecionar", searchPlaceholder = "Buscar…", emptyText = "Nada encontrado", trigger, disabled, invalid, id, className, contentClassName, footerAction, align = "start", ...aria }: MultiComboboxProps<V>) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <DefaultTrigger id={id} invalid={invalid} disabled={disabled} className={className} placeholderShown={!selected.length} {...aria}>
            {selected.length ? <span className="truncate text-fg">{selected.map((s) => s.label).join(", ")}</span> : placeholder}
          </DefaultTrigger>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className={cn("w-[var(--radix-popover-trigger-width)] min-w-56 p-1", contentClassName)}>
        <OptionsList multi options={options} isSelected={(v) => value.includes(v)} onPick={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])} emptyText={emptyText} searchPlaceholder={searchPlaceholder} footerAction={footerAction} />
      </PopoverContent>
    </Popover>
  );
}

/** Campo completo com label/erro para Combobox. */
export function SelectField<V extends string>({ label, hint, error, required, containerClassName, ...props }: ComboboxProps<V> & { label?: React.ReactNode; hint?: React.ReactNode; error?: string; required?: boolean; containerClassName?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={containerClassName}>
      {({ id, describedBy, invalid }) => <Combobox id={id} aria-describedby={describedBy} invalid={invalid} {...props} />}
    </Field>
  );
}

export function MultiSelectField<V extends string>({ label, hint, error, required, containerClassName, ...props }: MultiComboboxProps<V> & { label?: React.ReactNode; hint?: React.ReactNode; error?: string; required?: boolean; containerClassName?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={containerClassName}>
      {({ id, describedBy, invalid }) => <MultiCombobox id={id} aria-describedby={describedBy} invalid={invalid} {...props} />}
    </Field>
  );
}

/* ───────── Checkbox / Switch / Radio ───────── */
export function Checkbox({ checked, onCheckedChange, label, description, disabled, id, className }: { checked: boolean | "indeterminate"; onCheckedChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean; id?: string; className?: string }) {
  const box = (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      onClick={(e) => e.stopPropagation()}
      aria-label={typeof label === "string" ? undefined : "Selecionar"}
      className="peer flex size-4 shrink-0 items-center justify-center rounded-xs border border-line-strong bg-layer-2 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent text-accent-fg disabled:opacity-50 max-md:size-5"
    >
      <CheckboxPrimitive.Indicator>
        <Icon name={checked === "indeterminate" ? "minus" : "check"} size="xs" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!label) return box;
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5", disabled && "cursor-not-allowed opacity-60", className)}>
      <span className="mt-0.5">{box}</span>
      <span>
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="block text-xs text-fg-subtle">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({ checked, onCheckedChange, label, description, disabled, size = "md", ariaLabel }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: React.ReactNode; description?: React.ReactNode; disabled?: boolean; size?: "sm" | "md"; /** Rótulo acessível quando não há `label` visível. */ ariaLabel?: string }) {
  const sw = (
    <SwitchPrimitive.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      className={cn("relative inline-flex shrink-0 cursor-pointer items-center rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50", size === "sm" ? "h-4 w-7" : "h-5 w-9")}
    >
      <SwitchPrimitive.Thumb className={cn("block rounded-full bg-white shadow-raised transition-transform", size === "sm" ? "size-3 translate-x-0.5 data-[state=checked]:translate-x-3.5" : "size-4 translate-x-0.5 data-[state=checked]:translate-x-[18px]")} />
    </SwitchPrimitive.Root>
  );
  if (!label) return sw;
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-4", disabled && "cursor-not-allowed opacity-60")}>
      <span>
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="block text-xs text-fg-subtle">{description}</span>}
      </span>
      {sw}
    </label>
  );
}

export function RadioGroup<V extends string>({ value, onChange, options, className, orientation = "vertical" }: { value: V; onChange: (v: V) => void; options: Option<V>[]; className?: string; orientation?: "vertical" | "horizontal" }) {
  return (
    <RadioPrimitive.Root value={value} onValueChange={(v) => onChange(v as V)} className={cn("grid gap-2", orientation === "horizontal" && "sm:grid-flow-col sm:auto-cols-fr", className)}>
      {options.map((o) => (
        <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors", value === o.value ? "border-accent bg-accent-subtle" : "border-line hover:border-line-strong", o.disabled && "cursor-not-allowed opacity-50")}>
          <RadioPrimitive.Item value={o.value} disabled={o.disabled} className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong data-[state=checked]:border-accent">
            <RadioPrimitive.Indicator className="size-2 rounded-full bg-accent" />
          </RadioPrimitive.Item>
          {o.icon && <Icon name={o.icon} size="md" className={value === o.value ? "text-accent" : "text-fg-subtle"} />}
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">{o.label}</span>
            {o.description && <span className="mt-0.5 block text-xs text-fg-subtle">{o.description}</span>}
          </span>
        </label>
      ))}
    </RadioPrimitive.Root>
  );
}

/** Seletor segmentado (ex.: visão lista/kanban, período). */
export function SegmentedControl<V extends string>({ value, onChange, options, size = "sm", className, "aria-label": ariaLabel }: { value: V; onChange: (v: V) => void; options: (Option<V> & { iconOnly?: boolean })[]; size?: "xs" | "sm"; className?: string; "aria-label"?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("inline-flex items-center gap-0.5 rounded-md border border-line bg-layer p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={o.iconOnly ? o.label : undefined}
            title={o.iconOnly ? o.label : undefined}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors",
              size === "xs" ? "h-6 px-1.5 text-xs" : "h-7 px-2 text-xs max-md:h-9 max-md:px-3",
              active ? "bg-layer-2 text-fg shadow-raised" : "text-fg-subtle hover:text-fg",
            )}
          >
            {o.icon && <Icon name={o.icon} size="sm" />}
            {!o.iconOnly && o.label}
          </button>
        );
      })}
    </div>
  );
}
