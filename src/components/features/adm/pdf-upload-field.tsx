"use client";
import { useRef, useState } from "react";
import { Button, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fileSize } from "@/lib/format";

/** Escolha de um arquivo PDF (clique ou arrastar). O envio acontece ao salvar o formulário. */
export function PdfUploadField({ file, onChange, currentName, error, maxMb = 25 }: { file: File | null; onChange: (f: File | null) => void; currentName?: string | null; error?: string; maxMb?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setLocalError("Envie um arquivo PDF.");
    if (f.size > maxMb * 1024 * 1024) return setLocalError(`O arquivo passa de ${maxMb} MB. Comprima o PDF e tente de novo.`);
    setLocalError(null);
    onChange(f);
  };
  const msg = error ?? localError;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">Arquivo (PDF)</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-3 transition-colors", drag ? "border-accent bg-accent-subtle" : "border-line-strong bg-layer", msg && "border-danger")}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-layer-2 text-fg-subtle">
          <Icon name={file || currentName ? "document" : "upload"} size="md" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {file ? (
            <>
              <p className="truncate font-medium text-fg">{file.name}</p>
              <p className="text-xs text-fg-subtle">{fileSize(file.size)} · será enviado ao salvar</p>
            </>
          ) : currentName ? (
            <>
              <p className="truncate font-medium text-fg">{currentName}</p>
              <p className="text-xs text-fg-subtle">Arquivo atual. Envie outro para criar uma nova versão.</p>
            </>
          ) : (
            <p className="text-fg-subtle">Arraste o PDF aqui ou escolha no computador (opcional).</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {file && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Remover
            </Button>
          )}
          <Button size="sm" variant="outline" icon="upload" onClick={() => ref.current?.click()}>
            {file || currentName ? "Trocar arquivo" : "Escolher PDF"}
          </Button>
        </div>
        <input ref={ref} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      </div>
      <p aria-live="polite" className={cn("text-xs", msg ? "text-danger" : "sr-only")}>
        {msg}
      </p>
    </div>
  );
}
