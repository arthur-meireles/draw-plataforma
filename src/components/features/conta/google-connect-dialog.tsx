"use client";
import { useState } from "react";
import { usePermissions } from "@/components/layout/session";
import { Avatar, Badge, Button, Callout, Dialog, Icon } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { mailApi } from "@/data/services";

/**
 * Autorização OAuth do Google (simulada): escopo somente de envio, app Interno ao domínio
 * da Draw (RNF-15). No back-end real este passo redireciona para o consentimento do Google.
 */
export function GoogleConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = usePermissions();
  const [error, setError] = useState<string | undefined>();
  const connect = useApiMutation(() => mailApi.connect({ kind: "gmail_oauth", address: user.email, displayName: user.name }), {
    success: "Caixa do Google conectada",
    onSuccess: () => onOpenChange(false),
    onError: (e) => setError(e.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(undefined);
        onOpenChange(o);
      }}
      size="sm"
      title="Conectar com Google"
      description="Simulação do consentimento do Google"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={connect.isPending} onClick={() => connect.mutate(undefined)}>
            Permitir envio de e-mails
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-layer p-3">
          <Avatar name={user.name} color={user.avatarColor} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{user.name}</p>
            <p className="truncate text-xs text-fg-subtle">{user.email}</p>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <p className="flex items-center gap-2 font-medium text-fg">
            Draw Plataforma <Badge tone="info" size="xs">App interno</Badge>
          </p>
          <p className="text-fg-muted">quer permissão para:</p>
          <ul className="space-y-1.5 text-fg-muted">
            <li className="flex items-start gap-2">
              <Icon name="send" size="sm" className="mt-0.5 text-accent" />
              Enviar e-mails em seu nome (somente envio)
            </li>
          </ul>
        </div>
        <Callout tone="info" icon="shield">
          Não lemos sua caixa de entrada. O app é interno ao domínio da Draw e a conexão pode ser removida a qualquer momento, o que apaga o acesso guardado.
        </Callout>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
