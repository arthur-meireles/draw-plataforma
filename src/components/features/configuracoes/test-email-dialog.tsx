"use client";
import { useEffect, useState } from "react";
import { usePermissions } from "@/components/layout/session";
import { Button, Dialog, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { mailApi } from "@/data/services";

/** Envia um e-mail de teste pelo transporte configurado (RF-M11-01). */
export function TestEmailDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = usePermissions();
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (open) {
      setTo(user.email);
      setError(undefined);
    }
  }, [open, user.email]);

  const send = useApiMutation(mailApi.sendSystemTest, {
    success: "E-mail de teste enviado. Confira a caixa de entrada e o spam.",
    onSuccess: () => onOpenChange(false),
    onError: (e) => setError(e.message),
  });
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(to.trim())) return setError("Informe um e-mail válido, ex.: nome@draw.com.br");
    setError(undefined);
    send.mutate(to.trim());
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Enviar e-mail de teste"
      description="Usa a configuração salva do sistema. Salve as alterações antes de testar."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon="send" loading={send.isPending} onClick={() => submit()}>
            Enviar teste
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <TextField label="Enviar para" type="email" autoFocus value={to} onChange={(e) => setTo(e.target.value)} error={error} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
