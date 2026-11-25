"use client";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { IconButton } from "./button";
import { Icon } from "./icon";

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

/**
 * Valor de cadastro copiável com um clique (e-mail, chave PIX, CNPJ, telefone, dados bancários…).
 * Mostra o valor normalmente + botão de copiar discreto: aparece ao passar o mouse/focar no desktop e fica sempre
 * visível em telas de toque. Ao copiar, o ícone vira ✓ por um instante e um toast confirma o que foi copiado.
 * `value` é o texto copiado (sem máscara, ex.: só dígitos); `children` é o que aparece (pode ser formatado).
 */
export function Copyable({ value, label, children, className }: { value: string | null | undefined; label: string; children?: React.ReactNode; className?: string }) {
  const [done, setDone] = useState(false);
  if (!value) return <>{children ?? "—"}</>;
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (await copyText(value)) {
      toast.success("Copiado para a área de transferência", { description: `${label}: ${value}` });
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } else toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
  };
  return (
    <span className={cn("group/copy inline-flex max-w-full items-center gap-1 align-middle", className)}>
      <span className="min-w-0 truncate">{children ?? value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copiar ${label.toLowerCase()}`}
        title={`Copiar ${label.toLowerCase()}`}
        className={cn(
          "touch-target inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-fg-placeholder transition-[opacity,color,transform] duration-150 hover:bg-layer-hover hover:text-fg active:scale-90",
          done ? "text-success opacity-100" : "opacity-0 group-hover/copy:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100",
        )}
      >
        <Icon name={done ? "check" : "copy"} size="xs" />
      </button>
    </span>
  );
}
