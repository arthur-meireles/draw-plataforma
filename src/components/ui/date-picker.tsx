"use client";
/**
 * Seletor de data pt-BR (dd/mm/aaaa). Desktop: calendário próprio em popover.
 * Celular: seletor nativo do sistema (melhor experiência de toque).
 * Valor sempre "yyyy-mm-dd" (como <input type="date">) — use toDateInput/fromDateInput.
 */
import { forwardRef, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Popover, PopoverContent, PopoverTrigger } from "./overlay";
import { controlBase, Field, type InputProps } from "./input";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (v: string) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const formatDateBr = (v: string) => (v ? v.split("-").reverse().join("/") : "");

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  clearable?: boolean;
}

export const DatePicker = forwardRef<HTMLButtonElement, DatePickerProps>(function DatePicker({ value, onChange, id, disabled, invalid, placeholder = "dd/mm/aaaa", min, max, className, clearable = true, ...aria }, ref) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => (value ? parseKey(value) : new Date()));
  const todayKey = toKey(new Date());

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };
  const outOfRange = (key: string) => (!!min && key < min) || (!!max && key > max);
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <>
      {/* celular: nativo */}
      <input
        type="date"
        id={id ? `${id}-native` : undefined}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        onChange={(e) => onChange(e.target.value)}
        className={cn(controlBase, "h-11 px-2.5 md:hidden dark:[color-scheme:dark]", className)}
      />
      {/* desktop: calendário */}
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setCursor(value ? parseKey(value) : new Date());
        }}
      >
        <PopoverTrigger asChild disabled={disabled}>
          <button
            ref={ref}
            type="button"
            id={id}
            data-invalid={invalid || undefined}
            aria-label={aria["aria-label"]}
            aria-describedby={aria["aria-describedby"]}
            className={cn(controlBase, "flex h-8 items-center gap-2 px-2.5 text-left tabular-nums max-md:hidden data-[invalid=true]:border-danger", !value && "text-fg-placeholder", className)}
          >
            <Icon name="date" size="sm" className="text-fg-subtle" />
            <span className="flex-1 truncate">{value ? formatDateBr(value) : placeholder}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" aria-label="Mês anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-layer-hover hover:text-fg">
              <Icon name="chevronLeft" size="sm" />
            </button>
            <span className="text-sm font-medium text-fg first-letter:uppercase">{monthLabel}</span>
            <button type="button" aria-label="Próximo mês" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-layer-hover hover:text-fg">
              <Icon name="chevronRight" size="sm" />
            </button>
          </div>
          <div role="grid" className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="py-1 text-2xs font-medium text-fg-subtle">
                {w}
              </span>
            ))}
            {days.map((d) => {
              const key = toKey(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const selected = key === value;
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
                  disabled={outOfRange(key)}
                  onClick={() => pick(key)}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-md text-xs tabular-nums transition-colors disabled:opacity-30",
                    selected ? "bg-accent-solid font-semibold text-accent-fg" : key === todayKey ? "font-semibold text-accent ring-1 ring-inset ring-accent-line hover:bg-layer-hover" : inMonth ? "text-fg hover:bg-layer-hover" : "text-fg-placeholder hover:bg-layer-hover",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button type="button" onClick={() => pick(todayKey)} className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-layer-hover">
              Hoje
            </button>
            {clearable && value && (
              <button type="button" onClick={() => pick("")} className="rounded-md px-2 py-1 text-xs text-fg-subtle hover:bg-layer-hover hover:text-fg">
                Limpar
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
});

/**
 * Compatível com a API de <input type="date"> (value "yyyy-mm-dd" + onChange(e) com e.target.value),
 * para que todas as telas ganhem o seletor pt-BR sem mudança.
 */
export const DateInput = forwardRef<HTMLButtonElement, Omit<InputProps, "onChange" | "value"> & { value?: string; onChange?: (e: { target: { value: string }; currentTarget: { value: string } }) => void }>(function DateInput({ value, onChange, id, disabled, invalid, min, max, className, placeholder, ...rest }, ref) {
  return (
    <DatePicker
      ref={ref}
      id={id}
      value={value ?? ""}
      disabled={disabled}
      invalid={invalid || rest["aria-invalid"] === true}
      min={typeof min === "string" ? min : undefined}
      max={typeof max === "string" ? max : undefined}
      placeholder={placeholder}
      className={className}
      aria-label={rest["aria-label"]}
      aria-describedby={rest["aria-describedby"]}
      onChange={(v) => onChange?.({ target: { value: v }, currentTarget: { value: v } })}
    />
  );
});

export function DateField({ label, hint, error, required, containerClassName, ...props }: React.ComponentProps<typeof DateInput> & { label?: React.ReactNode; hint?: React.ReactNode; error?: string; containerClassName?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={containerClassName}>
      {({ id, describedBy, invalid }) => <DateInput id={id} aria-describedby={describedBy} invalid={invalid} {...props} />}
    </Field>
  );
}
