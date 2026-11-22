"use client";
import { useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/components/layout/session";
import { Button, Callout, CopyButton, Section, Skeleton, TextField } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { mailApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";
import { buildSignatureHtml, EMPTY_SIGNATURE, parseSignature, validateSignature, type SignatureFields } from "@/lib/signature";

/** Pré-visualização isolada, como o cliente de e-mail renderiza (fundo branco, sem herdar o tema). */
function SignaturePreview({ html }: { html: string }) {
  return <iframe title="Pré-visualização da assinatura" sandbox="" srcDoc={`<!doctype html><html><body style="margin:16px;background:#ffffff;">${html}</body></html>`} className="h-40 w-full rounded-lg border border-line bg-surface" />;
}

/** Editor de assinatura HTML (RF-M11-04): campos → tabela compatível com Gmail e Outlook, com preview ao vivo. */
export function SignatureEditor() {
  const { user } = usePermissions();
  const q = useApiQuery(["mail", "mine"], mailApi.myAccount);
  const [f, setF] = useState<SignatureFields>(EMPTY_SIGNATURE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [legacy, setLegacy] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    const parsed = parseSignature(q.data.signature);
    if (parsed) setF(parsed);
    else {
      setLegacy(!!q.data.signature);
      setF({ ...EMPTY_SIGNATURE, name: user.name, role: user.jobTitle ?? "", email: user.email, phone: user.phone ?? "" });
    }
  }, [q.data, user]);

  const html = useMemo(() => buildSignatureHtml(f.name.trim() ? f : { ...f, name: "Seu nome" }), [f]);
  const save = useApiMutation(mailApi.saveSignature, { success: "Assinatura salva" });
  const set = (k: keyof SignatureFields) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateSignature(f);
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    save.mutate(buildSignatureHtml(f));
  };

  return (
    <Section title="Assinatura" description="Entra automaticamente no fim dos e-mails enviados pela plataforma" icon="edit">
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={submit} noValidate className="space-y-4">
            {legacy && <Callout tone="warning" title="Sua assinatura atual será substituída">Ela foi criada fora desta tela. Ao salvar, usamos o modelo abaixo, que funciona no Gmail e no Outlook.</Callout>}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Nome" required value={f.name} onChange={set("name")} error={errors.name} />
              <TextField label="Cargo" value={f.role} onChange={set("role")} />
              <TextField label="Empresa" value={f.company} onChange={set("company")} />
              <TextField label="Telefone" inputMode="tel" value={f.phone} onChange={set("phone")} />
              <TextField label="E-mail" type="email" value={f.email} onChange={set("email")} error={errors.email} />
              <TextField label="Site" value={f.website} onChange={set("website")} placeholder="draw.com.br" />
            </div>
            <TextField label="Endereço do logo (opcional)" type="url" inputMode="url" value={f.logoUrl} onChange={set("logoUrl")} error={errors.logoUrl} placeholder="https://" hint="O logo precisa estar hospedado (https). Texto e logo ficam separados para não virar uma imagem única." />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" loading={save.isPending}>
                Salvar assinatura
              </Button>
              <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
                <CopyButton value={html} label="Copiar HTML da assinatura" successMessage="HTML da assinatura copiado" size="sm" />
                Copiar HTML
              </span>
            </div>
          </form>
          <div className="space-y-2">
            <p className="text-xs font-medium text-fg-muted">Pré-visualização</p>
            <SignaturePreview html={html} />
            <p className="text-xs text-fg-subtle">Tabela com estilos inline: aparece igual no Gmail e no Outlook.</p>
          </div>
        </div>
      )}
    </Section>
  );
}
