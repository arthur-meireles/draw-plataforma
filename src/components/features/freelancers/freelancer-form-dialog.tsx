"use client";
/** Cadastro/edição de freelancer (RF-M2-03). Dados fiscais e bancários só para quem tem acesso. */
import { useEffect, useState } from "react";
import { Button, Dialog, Icon, MultiSelectField, SelectField, TextField, TextareaField } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { freelancersApi, type FreelancerInput } from "@/data/services";
import { SPECIALTY_LABEL } from "@/data/reference";
import type { Freelancer, Specialty } from "@/data/types";
import { formatPhone, onlyDigits } from "@/lib/format";
import { formatCpfCnpj } from "@/lib/format-document";

const EMPTY: FreelancerInput = { name: "", email: "", phone: "", legalName: "", document: "", pixKey: "", bankName: "", bankAgency: "", bankAccount: "", specialties: [], status: "ativo", notes: "" };
const SPECIALTY_OPTIONS = (Object.keys(SPECIALTY_LABEL) as Specialty[]).map((s) => ({ value: s, label: SPECIALTY_LABEL[s] }));

export function FreelancerFormDialog({ open, onOpenChange, freelancer }: { open: boolean; onOpenChange: (o: boolean) => void; freelancer?: Freelancer | null }) {
  const perms = usePermissions();
  const canBank = perms.canRead("freelancerBank");
  const canManage = perms.canWriteAll("freelancers");
  const [form, setForm] = useState<FreelancerInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      freelancer
        ? {
            name: freelancer.name,
            email: freelancer.email,
            phone: freelancer.phone ?? "",
            legalName: freelancer.legalName ?? "",
            document: freelancer.document ?? "",
            pixKey: freelancer.pixKey ?? "",
            bankName: freelancer.bankName ?? "",
            bankAgency: freelancer.bankAgency ?? "",
            bankAccount: freelancer.bankAccount ?? "",
            specialties: freelancer.specialties,
            status: freelancer.status,
            notes: freelancer.notes ?? "",
          }
        : EMPTY,
    );
  }, [open, freelancer]);

  const focusFirst = (errs: Record<string, string>) => document.getElementById(`fl-${Object.keys(errs)[0]}`)?.focus();
  const save = useApiMutation(
    (input: FreelancerInput) => {
      const clean: FreelancerInput = { ...input, name: input.name.trim(), email: input.email.trim(), phone: input.phone || null, legalName: input.legalName?.trim() || null, document: input.document || null, pixKey: input.pixKey?.trim() || null, bankName: input.bankName?.trim() || null, bankAgency: input.bankAgency?.trim() || null, bankAccount: input.bankAccount?.trim() || null, notes: input.notes?.trim() || null };
      return freelancer ? freelancersApi.update(freelancer.id, clean) : freelancersApi.create(clean);
    },
    {
      success: freelancer ? "Freelancer atualizado" : "Freelancer cadastrado",
      onSuccess: () => onOpenChange(false),
      onError: (e) => {
        if (e.fieldErrors) {
          setErrors(e.fieldErrors);
          focusFirst(e.fieldErrors);
        }
      },
    },
  );

  const set = <K extends keyof FreelancerInput>(k: K, v: FreelancerInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Informe o nome";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Informe um e-mail válido, ex.: nome@gmail.com";
    if (!form.specialties.length) errs.specialties = "Escolha ao menos uma especialidade";
    const digits = onlyDigits(form.document ?? "");
    if (canBank && digits && digits.length !== 11 && digits.length !== 14) errs.document = "CPF tem 11 dígitos e CNPJ tem 14";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirst(errs);
    save.mutate(form);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={freelancer ? "Editar freelancer" : "Cadastrar freelancer"}
      description="Quem trabalha com a Draw por projeto e emite nota fiscal para receber."
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {freelancer ? "Salvar freelancer" : "Cadastrar freelancer"}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField id="fl-name" label="Nome" required autoFocus containerClassName="sm:col-span-2" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors.name} autoComplete="off" />
        <TextField id="fl-email" label="E-mail" required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} autoComplete="off" />
        <TextField id="fl-phone" label="Telefone" inputMode="tel" placeholder="(11) 99999-0000" value={form.phone ?? ""} onChange={(e) => set("phone", formatPhone(e.target.value))} />
        <MultiSelectField label="Especialidades" required containerClassName="sm:col-span-2" options={SPECIALTY_OPTIONS} value={form.specialties} onChange={(v) => set("specialties", v)} placeholder="Escolha uma ou mais" error={errors.specialties} />
        {canManage && freelancer && (
          <SelectField label="Status" options={[{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }]} value={form.status} onChange={(v) => v && set("status", v as Freelancer["status"])} />
        )}

        <fieldset className="grid gap-4 rounded-lg border border-line p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-fg">
            <Icon name="lock" size="sm" className="text-fg-subtle" />
            Dados fiscais e bancários
          </legend>
          {canBank ? (
            <>
              <p className="flex items-center gap-1.5 text-xs text-fg-subtle sm:col-span-2">
                <Icon name="secure" size="xs" />
                Armazenados cifrados. Só administração, financeiro e o próprio freelancer enxergam.
              </p>
              <TextField id="fl-legalName" label="Razão social / nome na NF" value={form.legalName ?? ""} onChange={(e) => set("legalName", e.target.value)} />
              <TextField id="fl-document" label="CPF ou CNPJ" inputMode="numeric" placeholder="000.000.000-00" value={form.document ?? ""} onChange={(e) => set("document", formatCpfCnpj(e.target.value))} error={errors.document} />
              <TextField id="fl-pixKey" label="Chave PIX" containerClassName="sm:col-span-2" value={form.pixKey ?? ""} onChange={(e) => set("pixKey", e.target.value)} autoComplete="off" />
              <TextField id="fl-bankName" label="Banco" value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <TextField id="fl-bankAgency" label="Agência" inputMode="numeric" value={form.bankAgency ?? ""} onChange={(e) => set("bankAgency", e.target.value)} />
                <TextField id="fl-bankAccount" label="Conta" value={form.bankAccount ?? ""} onChange={(e) => set("bankAccount", e.target.value)} />
              </div>
            </>
          ) : (
            <p className="text-sm text-fg-subtle sm:col-span-2">Seu perfil não tem acesso a dados fiscais e bancários. O freelancer ou o financeiro preenchem esses campos.</p>
          )}
        </fieldset>

        <TextareaField label="Observações" containerClassName="sm:col-span-2" rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </form>
    </Dialog>
  );
}
