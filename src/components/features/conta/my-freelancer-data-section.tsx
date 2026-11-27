"use client";
import { useEffect, useState } from "react";
import { Button, Callout, ErrorState, FormSkeleton, Section, TextField, useSuccessFlash } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { freelancerSelfApi, type MyFreelancerDataInput } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";
import { formatPhone } from "@/lib/format";
import { formatCpfCnpj } from "@/lib/format-document";

const EMPTY: MyFreelancerDataInput = { phone: null, legalName: null, document: null, pixKey: null, bankName: null, bankAgency: null, bankAccount: null };

/** Meus dados (freelancer — RN-39): telefone, dados para NF e para receber. Mudanças avisam o Financeiro. */
export function MyFreelancerDataSection() {
  const q = useApiQuery(["me", "freelancer"], freelancerSelfApi.myData);
  const [form, setForm] = useState<MyFreelancerDataInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ok = useSuccessFlash();
  useEffect(() => {
    if (q.data) {
      const { phone, legalName, document, pixKey, bankName, bankAgency, bankAccount } = q.data;
      setForm({ phone, legalName, document, pixKey, bankName, bankAgency, bankAccount });
    }
  }, [q.data]);

  const save = useApiMutation(freelancerSelfApi.updateMyData, {
    success: "Dados salvos. O Financeiro foi avisado da mudança.",
    onSuccess: () => (setErrors({}), ok.flash()),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });
  const set = (k: keyof MyFreelancerDataInput, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <Section title="Meus dados de pagamento" description="Usados pelo Financeiro para pagar você e conferir suas notas fiscais" icon="money">
      {q.isLoading ? (
        <FormSkeleton />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-8" />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Callout tone="info">Ao salvar uma mudança de PIX, banco ou documento, o Financeiro da Draw é avisado e a alteração fica registrada.</Callout>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Telefone" inputMode="tel" value={form.phone ?? ""} onChange={(e) => set("phone", formatPhone(e.target.value))} error={errors.phone} />
            <TextField label="Nome ou razão social para a NF" value={form.legalName ?? ""} onChange={(e) => set("legalName", e.target.value)} error={errors.legalName} />
            <TextField label="CPF ou CNPJ" inputMode="numeric" value={form.document ?? ""} onChange={(e) => set("document", formatCpfCnpj(e.target.value))} error={errors.document} />
            <TextField label="Chave PIX" spellCheck={false} value={form.pixKey ?? ""} onChange={(e) => set("pixKey", e.target.value)} error={errors.pixKey} hint="Ou preencha banco, agência e conta." />
            <TextField label="Banco" value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} error={errors.bankName} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Agência" inputMode="numeric" value={form.bankAgency ?? ""} onChange={(e) => set("bankAgency", e.target.value)} error={errors.bankAgency} />
              <TextField label="Conta" value={form.bankAccount ?? ""} onChange={(e) => set("bankAccount", e.target.value)} error={errors.bankAccount} />
            </div>
          </div>
          <Button type="submit" variant="primary" loading={save.isPending} success={ok.success} successLabel="Salvo">
            Salvar dados
          </Button>
        </form>
      )}
    </Section>
  );
}
