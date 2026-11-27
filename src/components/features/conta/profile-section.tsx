"use client";
import { useEffect, useState } from "react";
import { Avatar, Badge, Button, Copyable, Section, Skeleton, TextField, useSuccessFlash } from "@/components/ui";
import { useApiMutation, useMe } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { usersApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";
import { formatPhone, onlyDigits } from "@/lib/format";
import { AvatarColorPicker } from "./avatar-color-picker";

/** Perfil da própria pessoa: nome, cargo, telefone e cor do avatar. E-mail e perfil de acesso só a administração muda. */
export function ProfileSection() {
  const me = useMe();
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [color, setColor] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ok = useSuccessFlash();
  const u = me.data;

  useEffect(() => {
    if (u) {
      setName(u.name);
      setJobTitle(u.jobTitle ?? "");
      setPhone(u.phone ?? "");
      setColor(u.avatarColor);
    }
  }, [u?.id, u?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useApiMutation((v: { id: string; name: string; jobTitle: string | null; phone: string | null; avatarColor: string }) => usersApi.update(v.id, { name: v.name, jobTitle: v.jobTitle, phone: v.phone, avatarColor: v.avatarColor }), {
    success: "Perfil atualizado",
    onSuccess: () => ok.flash(),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  if (!u) return <Section title="Perfil" icon="user"><Skeleton className="h-48" /></Section>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Informe seu nome";
    if (phone && onlyDigits(phone).length < 10) errs.phone = "Use DDD + número, ex.: (11) 91234-5678";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    save.mutate({ id: u.id, name, jobTitle: jobTitle || null, phone: phone || null, avatarColor: color });
  };

  return (
    <Section title="Perfil" description="Como você aparece para a equipe" icon="user">
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={name || u.name} color={color} size="xl" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-fg">
              <Copyable value={u.email} label="E-mail">{u.email}</Copyable>
            </p>
            <p className="flex items-center gap-2 text-xs text-fg-subtle">
              Perfil de acesso <Badge tone={u.role === "admin" ? "accent" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
            </p>
            <p className="text-xs text-fg-subtle">E-mail e perfil de acesso são alterados pela administração da Draw.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nome" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <TextField label="Cargo" placeholder="Ex.: Designer" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} error={errors.jobTitle} />
          <TextField label="Telefone" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-0000" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} error={errors.phone} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-fg-muted">Cor do avatar</legend>
          <AvatarColorPicker name={name} value={color} onChange={setColor} />
        </fieldset>
        <Button type="submit" variant="primary" loading={save.isPending} success={ok.success} successLabel="Salvo">
          Salvar perfil
        </Button>
      </form>
    </Section>
  );
}
