"use client";
import { useState } from "react";
import { InstallAppButton } from "@/components/pwa/pwa-ui";
import { usePwa } from "@/components/pwa/pwa-provider";
import { Badge, Button, ConfirmDialog, Section } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { authApi } from "@/data/services";
import { usePermissions } from "@/components/layout/session";
import { isDemoMode } from "@/lib/demo";

/** Instalação do app (PWA) e restauração dos dados de demonstração. */
export function AppSection() {
  const { canInstall, isIos, isStandalone } = usePwa();
  const { canWriteAll } = usePermissions();
  /** RN-33: restaurar só existe na demonstração e só para administradores (o serviço também recusa). */
  const canReset = isDemoMode() && canWriteAll("settings");
  const [confirm, setConfirm] = useState(false);
  const reset = useApiMutation(authApi.resetDemo, { success: false, onSuccess: () => window.location.reload() });
  return (
    <>
      <Section title="Aplicativo" description="Use a Draw como app no celular ou no computador" icon="install">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-fg">Instalar app</p>
              <p className="text-xs text-fg-subtle">{isStandalone ? "O app já está instalado neste dispositivo." : canInstall || isIos ? "Abre em janela própria, com atalho na tela inicial e aviso de conexão." : "Seu navegador não ofereceu a instalação agora. Tente pelo menu do navegador."}</p>
            </div>
            {isStandalone ? <Badge tone="success" dot>Instalado</Badge> : <InstallAppButton variant="button" />}
          </div>
          {canReset && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <div>
              <p className="text-sm font-medium text-fg">Dados de demonstração</p>
              <p className="max-w-md text-xs text-fg-subtle">Apaga o que foi criado neste navegador e volta aos dados iniciais de exemplo.</p>
            </div>
            <Button variant="destructive-ghost" icon="restore" onClick={() => setConfirm(true)}>
              Restaurar dados de demonstração…
            </Button>
          </div>
          )}
        </div>
      </Section>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Restaurar dados de demonstração?"
        description="Tudo o que você criou ou alterou neste navegador será perdido e a página será recarregada. Você continua conectado."
        confirmLabel="Restaurar dados"
        destructive
        loading={reset.isPending}
        onConfirm={() => reset.mutate(undefined)}
      />
    </>
  );
}
