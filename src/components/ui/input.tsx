"use client";
import { forwardRef, useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import { centsToInput, parseMoney } from "@/lib/format";

export const controlBase =
  "w-full rounded-md border border-line bg-layer-2 text-sm text-fg placeholder:text-fg-placeholder transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName;
  invalid?: boolean;
  /** Elemento fixo à direita (ex.: unidade, botão de revelar). */
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, icon, invalid, suffix, ...props }, ref) {
  return (
    <div className="relative flex items-center">
      {icon && <Icon name={icon} size="sm" className="pointer-events-none absolute left-2.5 text-fg-subtle" />}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlBase, "h-8 px-2.5 max-md:h-11", icon && "pl-8", !!suffix && "pr-9", className)}
        {...props}
      />
      {suffix && <div className="absolute right-1 flex items-center">{suffix}</div>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; onSubmitShortcut?: () => void }>(
  function Textarea({ className, invalid, onSubmitShortcut, onKeyDown, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        onKeyDown={(e) => {
          if (onSubmitShortcut && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmitShortcut();
          }
          onKeyDown?.(e);
        }}
        className={cn(controlBase, "min-h-20 px-2.5 py-2 leading-relaxed resize-y", className)}
        {...props}
      />
    );
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-xs font-medium text-fg-muted", className)} {...props} />;
}

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  /** Recebe o id gerado para ligar label ↔ controle e aria-describedby. */
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

/** Envelope de campo: label + controle + dica/erro com aria-live. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </Label>
      )}
      {children({ id, describedBy: error || hint ? msgId : undefined, invalid: !!error })}
      <p id={msgId} aria-live="polite" className={cn("text-xs", error ? "text-danger" : "text-fg-subtle", !error && !hint && "sr-only")}>
        {error || hint}
      </p>
    </div>
  );
}

/** Campo de texto completo (atalho de Field + Input). */
export const TextField = forwardRef<HTMLInputElement, InputProps & { label?: React.ReactNode; hint?: React.ReactNode; error?: string; containerClassName?: string }>(
  function TextField({ label, hint, error, required, containerClassName, ...props }, ref) {
    return (
      <Field label={label} hint={hint} error={error} required={required} className={containerClassName}>
        {({ id, describedBy, invalid }) => <Input ref={ref} id={id} aria-describedby={describedBy} invalid={invalid} required={required} {...props} />}
      </Field>
    );
  },
);

export const TextareaField = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: React.ReactNode; hint?: React.ReactNode; error?: string; containerClassName?: string; onSubmitShortcut?: () => void }>(
  function TextareaField({ label, hint, error, required, containerClassName, ...props }, ref) {
    return (
      <Field label={label} hint={hint} error={error} required={required} className={containerClassName}>
        {({ id, describedBy, invalid }) => <Textarea ref={ref} id={id} aria-describedby={describedBy} invalid={invalid} required={required} {...props} />}
      </Field>
    );
  },
);

/** Valor em reais; emite centavos. */
export function MoneyInput({ value, onChange, invalid, id, placeholder = "0,00", className, ...rest }: { value: number | null | undefined; onChange: (cents: number) => void; invalid?: boolean; id?: string; placeholder?: string; "aria-describedby"?: string; disabled?: boolean; autoFocus?: boolean; className?: string }) {
  const [text, setText] = useState(centsToInput(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(centsToInput(value));
  }, [value, focused]);
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      invalid={invalid}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(centsToInput(parseMoney(text)));
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseMoney(e.target.value));
      }}
      className={cn("pl-8 tabular-nums", className)}
      {...rest}
    />
  );
}

export function MoneyField({ label, hint, error, required, className, ...props }: React.ComponentProps<typeof MoneyInput> & { label?: React.ReactNode; hint?: React.ReactNode; error?: string; required?: boolean }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-xs text-fg-subtle">R$</span>
          <MoneyInput id={id} aria-describedby={describedBy} invalid={invalid} {...props} />
        </div>
      )}
    </Field>
  );
}

/** Data (yyyy-mm-dd). */
export const DateInput = forwardRef<HTMLInputElement, InputProps>(function DateInput(props, ref) {
  return <Input ref={ref} type="date" {...props} className={cn("[&::-webkit-calendar-picker-indicator]:opacity-60 dark:[&::-webkit-calendar-picker-indicator]:invert", props.className)} />;
});

export function DateField({ label, hint, error, required, containerClassName, ...props }: InputProps & { label?: React.ReactNode; hint?: React.ReactNode; error?: string; containerClassName?: string }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={containerClassName}>
      {({ id, describedBy, invalid }) => <DateInput id={id} aria-describedby={describedBy} invalid={invalid} {...props} />}
    </Field>
  );
}

/** Busca com debounce e atalho para limpar. */
export function SearchInput({ value, onChange, placeholder = "Buscar…", className, autoFocus, debounce = 200 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean; debounce?: number }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), debounce);
    return () => clearTimeout(t);
  }, [text, value, onChange, debounce]);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Input
        icon="search"
        type="search"
        value={text}
        autoFocus={autoFocus}
        spellCheck={false}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setText("")}
        className="[&::-webkit-search-cancel-button]:hidden"
        suffix={
          text ? (
            <button type="button" aria-label="Limpar busca" onClick={() => setText("")} className="flex size-6 items-center justify-center rounded-sm text-fg-subtle hover:bg-layer-hover hover:text-fg">
              <Icon name="close" size="xs" />
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
