"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Dialog, Field, Icon, IconButton, Input, MultiCombobox, SelectField, TextField, TextareaField, type Option } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { filesApi, projectMailApi, type MailTemplateKey } from "@/data/services";
import type { ID } from "@/data/types";
import { fileSize } from "@/lib/format";
import type { ProjectDetail } from "./use-project";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Destinatários como "chips": sugestões do cliente e da equipe, ou e-mail digitado. */
function RecipientsField({ label, value, onChange, suggestions, error, required }: { label: string; value: string[]; onChange: (v: string[]) => void; suggestions: Option[]; error?: string; required?: boolean }) {
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string>();
  const add = (raw: string) => {
    const emails = raw.split(/[,;\s]+/).filter(Boolean);
    if (!emails.length) return;
    const bad = emails.find((e) => !EMAIL_RE.test(e));
    if (bad) {
      setLocalError(`"${bad}" não parece um e-mail válido`);
      return;
    }
    setLocalError(undefined);
    onChange([...new Set([...value, ...emails])]);
    setText("");
  };
  return (
    <Field label={label} required={required} error={error ?? localError}>
      {({ id, describedBy, invalid }) => (
        <div className="space-y-2">
          {value.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {value.map((e) => (
                <li key={e}>
                  <Badge tone="accent" className="h-6 gap-1 pr-0.5">
                    {e}
                    <button type="button" aria-label={`Remover ${e}`} onClick={() => onChange(value.filter((x) => x !== e))} className="flex size-4 items-center justify-center rounded-xs hover:bg-accent/15">
                      <Icon name="close" size="xs" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="email"
                inputMode="email"
                value={text}
                placeholder="Digite um e-mail e tecle Enter"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    add(text);
                  }
                }}
                onBlur={() => text && add(text)}
              />
            </div>
            <MultiCombobox
              options={suggestions}
              value={value}
              onChange={(v) => onChange(v)}
              contentClassName="w-72"
              align="end"
              searchPlaceholder="Buscar contato…"
              trigger={<Button icon="team">Sugestões</Button>}
            />
          </div>
        </div>
      )}
    </Field>
  );
}

/** Escrever e-mail pelo projeto (RF-M11-03): sugestões, modelos, anexos com escolha de versão. */
export function EmailComposer({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const recipients = useApiQuery(["project-mail", "recipients", project.id], () => projectMailApi.recipients(project.id));
  const templates = useApiQuery(["project-mail", "templates", project.id], () => projectMailApi.templates(project.id));
  const files = useApiQuery(["files", { projectId: project.id }], () => filesApi.list({ projectId: project.id }));

  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [template, setTemplate] = useState<MailTemplateKey | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<Record<ID, ID>>({}); // fileId → versionId
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pré-seleciona o contato de faturamento como destinatário.
  useEffect(() => {
    if (recipients.data && project.billingContact && !to.length) {
      const hit = recipients.data.find((r) => r.email === project.billingContact!.email);
      if (hit) setTo([hit.email]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients.data]);

  const applyTemplate = (key: MailTemplateKey | null) => {
    setTemplate(key);
    const t = templates.data?.find((x) => x.key === key);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  };

  const send = useApiMutation(() => projectMailApi.send(project.id, { to, cc, subject, body, attachments: Object.values(attached), template }), {
    success: "E-mail enviado e registrado no projeto",
    onSuccess: onClose,
    onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!to.length) next.to = "Adicione ao menos um destinatário";
    if (!subject.trim()) next.subject = "Escreva o assunto";
    if (!body.trim()) next.body = "Escreva a mensagem";
    setErrors(next);
    if (!Object.keys(next).length) send.mutate(undefined);
  };

  const suggestionOptions: Option[] = (recipients.data ?? []).map((r) => ({ value: r.email, label: r.name, description: `${r.email} · ${r.detail}`, group: r.source === "cliente" ? "Contatos do cliente" : "Equipe do projeto", keywords: [r.email] }));
  const fileOptions: Option[] = (files.data ?? []).filter((f) => f.category !== "nf").map((f) => ({ value: f.id, label: f.name, description: `v${f.current?.version} · ${fileSize(f.current?.size ?? 0)}` }));
  const templateOptions: Option<MailTemplateKey>[] = (templates.data ?? []).map((t) => ({ value: t.key, label: t.label }));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !send.isPending && onClose()}
      size="lg"
      dismissible={false}
      title="Escrever e-mail"
      description={`Enviado pela sua caixa e guardado no histórico de ${project.code}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={send.isPending}>Cancelar</Button>
          <Button variant="primary" icon="send" loading={send.isPending} onClick={submit}>Enviar e-mail</Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField label="Modelo" hint="Preenche assunto e mensagem com os dados do projeto. Você pode editar tudo." options={templateOptions} value={template} onChange={applyTemplate} placeholder="Começar em branco" clearable />
        <RecipientsField label="Para" required value={to} onChange={setTo} suggestions={suggestionOptions} error={errors.to} />
        {showCc ? <RecipientsField label="Cópia (Cc)" value={cc} onChange={setCc} suggestions={suggestionOptions} /> : <Button size="xs" variant="ghost" className="-mt-2 self-start" onClick={() => setShowCc(true)}>Adicionar cópia (Cc)</Button>}
        <TextField label="Assunto" required value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} />
        <TextareaField label="Mensagem" required rows={9} value={body} onChange={(e) => setBody(e.target.value)} error={errors.body} onSubmitShortcut={submit} hint="Sua assinatura é adicionada automaticamente ao final." />

        <Field label="Anexos" hint="Escolha arquivos do projeto e a versão que vai no e-mail.">
          {() => (
            <div className="space-y-2">
              <MultiCombobox
                options={fileOptions}
                value={Object.keys(attached)}
                onChange={(ids) => {
                  const next: Record<ID, ID> = {};
                  ids.forEach((id) => (next[id] = attached[id] ?? files.data?.find((f) => f.id === id)?.currentVersionId ?? ""));
                  setAttached(next);
                }}
                placeholder={files.isLoading ? "Carregando arquivos…" : fileOptions.length ? "Anexar arquivos do projeto" : "O projeto ainda não tem arquivos"}
                disabled={!fileOptions.length}
                searchPlaceholder="Buscar arquivo…"
              />
              {Object.entries(attached).map(([fileId, versionId]) => {
                const f = files.data?.find((x) => x.id === fileId);
                if (!f) return null;
                return (
                  <div key={fileId} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-sm">
                    <Icon name="attach" size="sm" className="text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <div className="w-44">
                      <SelectField
                        aria-label={`Versão de ${f.name}`}
                        options={f.versions.map((v) => ({ value: v.id, label: `v${v.version}${v.id === f.currentVersionId ? " (atual)" : ""}`, description: fileSize(v.size) }))}
                        value={versionId}
                        onChange={(v) => v && setAttached({ ...attached, [fileId]: v })}
                      />
                    </div>
                    <IconButton icon="close" label={`Remover anexo ${f.name}`} onClick={() => { const { [fileId]: _x, ...rest } = attached; void _x; setAttached(rest); }} />
                  </div>
                );
              })}
            </div>
          )}
        </Field>
      </div>
    </Dialog>
  );
}
