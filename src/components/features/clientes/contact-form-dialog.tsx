"use client";
/** Cadastro/edição de contato do cliente com validação de e-mail (RF-M2-02). */
import { useEffect, useState } from "react";
import { Button, Dialog, Switch, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { clientsApi } from "@/data/services";
import type { ClientContact, ID } from "@/data/types";
import { formatPhone } from "@/lib/format";

interface Form {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  isBillingContact: boolean;
  isDecisionMaker: boolean;
}
const EMPTY: Form = { name: "", email: "", phone: "", jobTitle: "", isBillingContact: false, isDecisionMaker: false };

export function ContactFormDialog({ open, onOpenChange, clientId, contact }: { open: boolean; onOpenChange: (o: boolean) => void; clientId: ID; contact?: ClientContact | null }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(contact ? { name: contact.name, email: contact.email, phone: contact.phone ?? "", jobTitle: contact.jobTitle ?? "", isBillingContact: contact.isBillingContact, isDecisionMaker: contact.isDecisionMaker } : EMPTY);
    setErrors({});
  }, [open, contact]);

  const focusFirst = (errs: Record<string, string>) => document.getElementById(`contact-${Object.keys(errs)[0]}`)?.focus();
  const save = useApiMutation((f: Form) => clientsApi.saveContact(clientId, { name: f.name.trim(), email: f.email.trim(), phone: f.phone || null, jobTitle: f.jobTitle.trim() || null, isBillingContact: f.isBillingContact, isDecisionMaker: f.isDecisionMaker }, contact?.id), {
    success: contact ? "Contato atualizado" : "Contato adicionado",
    onSuccess: () => onOpenChange(false),
    onError: (e) => {
      if (e.fieldErrors) {
        setErrors(e.fieldErrors);
        focusFirst(e.fieldErrors);
      }
    },
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Informe o nome do contato";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Informe um e-mail válido, ex.: nome@empresa.com.br";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirst(errs);
    save.mutate(form);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? "Editar contato" : "Adicionar contato"}
      description="Marque quem recebe cobranças e quem decide a aprovação das propostas."
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {contact ? "Salvar contato" : "Adicionar contato"}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField id="contact-name" label="Nome" required autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} autoComplete="off" />
        <TextField id="contact-email" label="E-mail" required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} autoComplete="off" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="contact-phone" label="Telefone" inputMode="tel" placeholder="(11) 99999-0000" value={form.phone} onChange={(e) => set("phone", formatPhone(e.target.value))} />
          <TextField id="contact-jobTitle" label="Cargo" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
        </div>
        <Switch checked={form.isBillingContact} onCheckedChange={(v) => set("isBillingContact", v)} label="Contato de cobrança" description="Recebe notas fiscais e avisos financeiros. Só um por cliente." />
        <Switch checked={form.isDecisionMaker} onCheckedChange={(v) => set("isDecisionMaker", v)} label="Decisor" description="Aprova propostas e entregas em nome do cliente." />
      </form>
    </Dialog>
  );
}
