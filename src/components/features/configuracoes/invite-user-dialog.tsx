"use client";
import { useEffect, useState } from "react";
import { Button, Callout, CopyButton, Dialog, Input, RadioGroup, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { usersApi } from "@/data/services";
import type { Role } from "@/data/types";
import { focusFirstInvalid } from "@/lib/focus";
import { INVITABLE_ROLES, ROLE_DESCRIPTION } from "./roles";

export const inviteLink = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/convite/${token}`;

/** Bloco com o link de convite e botão de copiar. */
export function InviteLinkBox({ token }: { token: string }) {
  const link = inviteLink(token);
  return (
    <div className="flex items-center gap-1.5">
      <Input readOnly value={link} aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <CopyButton value={link} label="Copiar link do convite" successMessage="Link do convite copiado" size="md" />
    </div>
  );
}

/** Convite de usuário (RF-M1-02): nome, e-mail e perfil; ao enviar, mostra o link /convite/<token>. */
export function InviteUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operacao");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ token: string; email: string } | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setRole("operacao");
      setErrors({});
      setDone(null);
    }
  }, [open]);

  const invite = useApiMutation(usersApi.invite, {
    success: "Convite enviado por e-mail",
    onSuccess: (r) => setDone({ token: r.inviteToken, email }),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Informe o nome da pessoa";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Informe um e-mail válido, ex.: nome@draw.com.br";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    invite.mutate({ name, email, role });
  };

  if (done)
    return (
      <Dialog open={open} onOpenChange={onOpenChange} title="Convite criado" description={`Enviamos um e-mail para ${done.email}.`} footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Concluir</Button>}>
        <div className="space-y-3">
          <p className="text-sm text-fg-muted">Se preferir, copie o link e envie você mesmo. Quem recebe define o nome e a senha ao aceitar.</p>
          <InviteLinkBox token={done.token} />
          <Callout tone="info">O link vale por 7 dias e só pode ser usado uma vez. Se precisar, gere um link novo ou reenvie o convite na lista de usuários.</Callout>
        </div>
      </Dialog>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Convidar usuário"
      description="A pessoa recebe um e-mail para criar a senha. O perfil define o que ela enxerga."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon="send" loading={invite.isPending} onClick={() => submit()}>
            Enviar convite
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nome" required autoFocus value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <TextField label="E-mail" required type="email" autoComplete="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-fg-muted">Perfil</legend>
          <RadioGroup value={role} onChange={setRole} options={INVITABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r], description: ROLE_DESCRIPTION[r] }))} className="sm:grid-cols-2" />
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
