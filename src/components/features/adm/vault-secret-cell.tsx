"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, copyText } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { admApi } from "@/data/services";

const REMASK_MS = 20_000;

/** Segredo mascarado: "Revelar" (log + remascara em 20 s) e "Copiar" (log + área de transferência). RF-M6-03. */
export function VaultSecretCell({ id, title }: { id: string; title: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const reveal = useApiMutation((action: "revelar" | "copiar") => admApi.reveal(id, action).then((s) => ({ s, action })), {
    success: false,
    onSuccess: async ({ s, action }) => {
      if (action === "copiar") {
        const ok = await copyText(s);
        if (ok) toast.success(`Senha de "${title}" copiada. O acesso foi registrado.`);
        else toast.error("Não foi possível copiar. Use “Revelar” e copie manualmente.");
        return;
      }
      setSecret(s);
      setLeft(REMASK_MS / 1000);
      stop();
      timer.current = setInterval(() => {
        setLeft((l) => {
          if (l <= 1) {
            stop();
            setSecret(null);
            return 0;
          }
          return l - 1;
        });
      }, 1000);
    },
  });

  const hide = () => {
    stop();
    setSecret(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <code aria-live="polite" className="min-w-24 max-w-52 select-all truncate rounded-sm bg-layer px-1.5 py-0.5 font-mono text-xs text-fg" aria-label={secret ? "Senha revelada" : "Senha oculta"}>
        {secret ?? "••••••••••"}
      </code>
      {secret ? (
        <Button size="xs" variant="ghost" icon="hide" onClick={hide} className="max-md:h-8">
          Ocultar ({left}s)
        </Button>
      ) : (
        <Button size="xs" variant="ghost" icon="reveal" loading={reveal.isPending && reveal.variables === "revelar"} onClick={() => reveal.mutate("revelar")} className="max-md:h-8" aria-label={`Revelar senha de ${title}`}>
          Revelar
        </Button>
      )}
      <Button size="xs" variant="ghost" icon="copy" loading={reveal.isPending && reveal.variables === "copiar"} onClick={() => reveal.mutate("copiar")} className="max-md:h-8" aria-label={`Copiar senha de ${title}`}>
        Copiar
      </Button>
    </div>
  );
}
