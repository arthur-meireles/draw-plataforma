"use client";
import { useEffect, useState } from "react";
import { usePermissions } from "@/components/layout/session";
import { Button, Dialog, PasswordField, SegmentedControl, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { mailApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";

/** Conexão por SMTP genérico: host, porta, segurança, usuário e senha de app (RF-M11-02). */
export function SmtpConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = usePermissions();
  const [address, setAddress] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [security, setSecurity] = useState<"starttls" | "ssl">("starttls");
  const [smtpUser, setSmtpUser] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setAddress(user.email);
    setSmtpUser(user.email);
    setHost("");
    setPort("587");
    setSecurity("starttls");
    setPassword("");
    setErrors({});
  }, [open, user.email]);

  const connect = useApiMutation(mailApi.connect, {
    success: "Caixa conectada por SMTP",
    onSuccess: () => onOpenChange(false),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(address.trim())) errs.address = "Informe o e-mail da caixa, ex.: nome@draw.com.br";
    if (!host.trim()) errs.smtpHost = "Informe o servidor SMTP, ex.: smtp.gmail.com";
    if (!port || Number(port) < 1 || Number(port) > 65535) errs.smtpPort = "Informe a porta (ex.: 587)";
    if (!smtpUser.trim()) errs.smtpUser = "Informe o usuário";
    if (!password) errs.smtpPassword = "Informe a senha de app";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    connect.mutate({ kind: "smtp", address: address.trim(), displayName: user.name, smtpHost: host.trim(), smtpPort: Number(port), smtpSecurity: security, smtpUser: smtpUser.trim(), smtpPassword: password });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dismissible={false}
      title="Conectar por SMTP"
      description="Use uma senha de app (não a senha da sua conta). Ela é guardada cifrada e nunca volta para a tela."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={connect.isPending} onClick={() => submit()}>
            Conectar caixa
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="E-mail da caixa" required type="email" autoFocus value={address} onChange={(e) => setAddress(e.target.value)} error={errors.address} />
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <TextField label="Servidor SMTP" required value={host} onChange={(e) => setHost(e.target.value)} error={errors.smtpHost} placeholder="smtp.exemplo.com" autoComplete="off" />
          <TextField label="Porta" required inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} error={errors.smtpPort} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Segurança</span>
          <SegmentedControl aria-label="Segurança da conexão" value={security} onChange={setSecurity} options={[{ value: "starttls", label: "STARTTLS" }, { value: "ssl", label: "SSL/TLS" }]} className="self-start" />
        </div>
        <TextField label="Usuário" required value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} error={errors.smtpUser} autoComplete="off" />
        <PasswordField label="Senha de app" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.smtpPassword} autoComplete="new-password" />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
