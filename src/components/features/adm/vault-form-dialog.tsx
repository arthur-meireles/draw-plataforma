"use client";
import { useEffect, useState } from "react";
import { Button, Callout, Dialog, MultiSelectField, PasswordField, PasswordStrength, TextareaField, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { admApi } from "@/data/services";
import type { Role } from "@/data/types";
import { focusFirstInvalid } from "@/lib/focus";
import { generatePassword } from "@/lib/password";

export interface VaultRow {
  id: string;
  title: string;
  url: string | null;
  username: string | null;
  notes: string | null;
  allowedRoles: Role[];
}

const ROLE_OPTIONS = (["gestao", "comercial", "financeiro", "operacao"] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/** Cadastro/edição de item do cofre (somente admin). Administradores sempre têm acesso. */
export function VaultFormDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item: VaultRow | null }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [notes, setNotes] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setUrl(item?.url ?? "");
    setUsername(item?.username ?? "");
    setSecret("");
    setNotes(item?.notes ?? "");
    setRoles((item?.allowedRoles ?? []).filter((r) => r !== "admin"));
    setErrors({});
  }, [open, item]);

  const save = useApiMutation((v: Parameters<typeof admApi.saveVaultItem>) => admApi.saveVaultItem(...v), {
    success: item ? "Item do cofre atualizado" : "Item adicionado ao cofre",
    onSuccess: () => onOpenChange(false),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Informe o título, ex.: Registro.br";
    if (url.trim() && !/^https?:\/\/\S+\.\S+/.test(url.trim())) errs.url = "Use um link completo, começando com https://";
    if (!item && !secret) errs.secret = "Informe a senha ou use “Gerar senha forte”";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    save.mutate([{ title, url: url.trim() || null, username: username.trim() || null, secret: secret || undefined, notes: notes.trim() || null, allowedRoles: ["admin", ...roles] }, item?.id]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dismissible={false}
      title={item ? "Editar item do cofre" : "Novo item no cofre"}
      description="A senha é guardada cifrada e só aparece para quem tem acesso, com registro de cada leitura."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => submit()}>
            {item ? "Salvar alterações" : "Adicionar ao cofre"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Título" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <TextField label="Endereço (URL)" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} error={errors.url} placeholder="https://" />
        <TextField label="Usuário" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        <div className="space-y-2">
          <PasswordField label={item ? "Nova senha" : "Senha"} required={!item} autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} error={errors.secret} hint={item ? "Deixe em branco para manter a senha atual." : undefined} />
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <PasswordStrength value={secret} />
            </div>
            <Button size="sm" variant="outline" icon="refresh" onClick={() => setSecret(generatePassword(20))}>
              Gerar senha forte
            </Button>
          </div>
        </div>
        <MultiSelectField label="Quem pode acessar" options={ROLE_OPTIONS} value={roles} onChange={setRoles} placeholder="Somente administradores" hint="Administradores sempre têm acesso. Freelancers nunca acessam o cofre." />
        <TextareaField label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex.: 2FA no celular da Beatriz" />
        {roles.length === 0 && <Callout tone="info">Só administradores verão este item.</Callout>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
