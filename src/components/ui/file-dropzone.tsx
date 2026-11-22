"use client";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fileSize } from "@/lib/format";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

export interface FileDropzoneProps {
  file: File | null;
  onFile: (file: File | null) => void;
  /** Extensões/MIME aceitos, no formato do atributo `accept`. */
  accept: string;
  /** Validação extra; retorne a mensagem de erro ou null. */
  validate?: (file: File) => string | null;
  label?: string;
  hint?: string;
  icon?: IconName;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}

/** Área de arrastar e soltar com seleção por toque (celular) e validação de tipo/tamanho. */
export function FileDropzone({ file, onFile, accept, validate, label, hint, icon = "upload", error, disabled, required }: FileDropzoneProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const shownError = error ?? localError ?? undefined;

  const take = (f: File | undefined) => {
    if (!f) return;
    const msg = validate?.(f) ?? null;
    setLocalError(msg);
    if (!msg) onFile(f);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-fg-muted">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-layer-2 p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
            <Icon name="file" size="md" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{file.name}</p>
            <p className="text-xs text-fg-subtle">{fileSize(file.size)}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setLocalError(null);
              onFile(null);
            }}
          >
            Trocar arquivo
          </Button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (!disabled) take(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
            over ? "border-accent bg-accent-subtle" : shownError ? "border-danger bg-danger-subtle/40" : "border-line-strong bg-layer-2",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-layer text-fg-subtle">
            <Icon name={icon} size="md" />
          </span>
          <p className="text-sm text-fg-muted max-sm:hidden">Arraste o arquivo para cá ou</p>
          <Button variant="secondary" size="md" icon="attach" disabled={disabled} onClick={() => inputRef.current?.click()}>
            Escolher arquivo
          </Button>
          {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
        </div>
      )}
      <p aria-live="polite" className={cn("text-xs text-danger", !shownError && "sr-only")}>
        {shownError}
      </p>
    </div>
  );
}
