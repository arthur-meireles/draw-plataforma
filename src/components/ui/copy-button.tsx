"use client";
import { useState } from "react";
import { toast } from "sonner";
import { IconButton } from "./button";

/** Copia texto para a área de transferência (com plano B para navegadores restritos). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.className = "fixed -left-[9999px] top-0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Botão só-ícone que copia. `value` pode ser assíncrono (ex.: segredo que gera log ao ser lido). */
export function CopyButton({ value, label = "Copiar", successMessage = "Copiado para a área de transferência", size = "sm", onCopied }: { value: string | (() => Promise<string>); label?: string; successMessage?: string; size?: "xs" | "sm" | "md"; onCopied?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <IconButton
      icon={done ? "check" : "copy"}
      label={label}
      size={size}
      loading={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          const text = typeof value === "function" ? await value() : value;
          const ok = await copyText(text);
          if (ok) {
            toast.success(successMessage);
            setDone(true);
            onCopied?.();
            setTimeout(() => setDone(false), 1800);
          } else toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
        } catch (err) {
          toast.error((err as { message?: string }).message ?? "Não foi possível copiar.");
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
