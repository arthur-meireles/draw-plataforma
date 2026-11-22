"use client";
/** Peças visuais do PWA: aviso de atualização, indicador offline, botão/ajuda de instalação. */
import { useEffect, useState } from "react";
import { Button, Dialog, Icon } from "@/components/ui";
import { usePwa } from "./pwa-provider";
import { cn } from "@/lib/cn";

/** "Nova versão disponível — atualizar" (não prende o usuário em versão antiga). */
export function UpdateBanner() {
  const { updateAvailable, applyUpdate } = usePwa();
  if (!updateAvailable) return null;
  return (
    <div role="status" className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-accent-line bg-surface px-3 py-2.5 shadow-overlay animate-scale-in pt-safe md:bottom-4 md:top-auto">
      <span className="flex size-8 items-center justify-center rounded-md bg-accent-subtle text-accent">
        <Icon name="sparkle" size="sm" />
      </span>
      <p className="flex-1 text-sm text-fg">Nova versão disponível.</p>
      <Button size="sm" variant="primary" onClick={applyUpdate}>
        Atualizar
      </Button>
    </div>
  );
}

/** Faixa discreta quando a conexão cai (V1 não edita offline — 10.6). */
export function OfflineIndicator() {
  const { online } = usePwa();
  if (online) return null;
  return (
    <div role="status" className="flex shrink-0 items-center justify-center gap-2 bg-warning-subtle px-3 py-1.5 text-xs font-medium text-warning pt-safe">
      <Icon name="offline" size="xs" />
      Sem conexão — mostrando a última versão carregada, somente leitura.
    </div>
  );
}

/** Ajuda "Instalar no iPhone" (iOS não mostra convite automático). */
export function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const steps = [
    { icon: "share" as const, text: "Abra no Safari e toque em Compartilhar, na barra inferior." },
    { icon: "add" as const, text: "Role e toque em \"Adicionar à Tela de Início\"." },
    { icon: "check" as const, text: "Confirme em \"Adicionar\". O Draw aparece como app." },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Instalar no iPhone ou iPad" description="Use o Draw como um app, em tela cheia, sem passar pela App Store." size="sm" footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Entendi</Button>}>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent">
              <Icon name={s.icon} size="sm" />
            </span>
            <p className="pt-1.5 text-sm text-fg-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

/** Botão "Instalar app": Chrome/Edge usa o convite nativo; iOS abre a ajuda. Some se já instalado. */
export function InstallAppButton({ variant = "menu", className }: { variant?: "menu" | "button"; className?: string }) {
  const { canInstall, isIos, isStandalone, install } = usePwa();
  const [iosOpen, setIosOpen] = useState(false);
  if (isStandalone || (!canInstall && !isIos)) return null;
  const onClick = () => (isIos ? setIosOpen(true) : install());
  return (
    <>
      {variant === "button" ? (
        <Button icon="install" size="sm" onClick={onClick} className={className}>
          Instalar app
        </Button>
      ) : (
        <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-layer-hover hover:text-fg max-md:py-2.5", className)}>
          <Icon name="install" size="sm" />
          Instalar app
        </button>
      )}
      <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />
    </>
  );
}

/** Convite discreto na primeira visita em celular (some ao dispensar). */
export function InstallPromptCard() {
  const { canInstall, isIos, isStandalone, install } = usePwa();
  const [dismissed, setDismissed] = useState(true);
  const [iosOpen, setIosOpen] = useState(false);
  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem("draw:install-dismissed") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (dismissed || isStandalone || (!canInstall && !isIos)) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem("draw:install-dismissed", "1");
    } catch {}
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 md:hidden">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-solid text-accent-fg">
        <Icon name="install" size="md" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">Instale o Draw no celular</p>
        <p className="text-xs text-fg-subtle">Acesso rápido, em tela cheia.</p>
      </div>
      <Button size="sm" variant="primary" onClick={() => (isIos ? setIosOpen(true) : install())}>
        Instalar
      </Button>
      <button type="button" aria-label="Dispensar" onClick={dismiss} className="flex size-8 items-center justify-center rounded-md text-fg-subtle hover:bg-layer-hover">
        <Icon name="close" size="sm" />
      </button>
      <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />
    </div>
  );
}
