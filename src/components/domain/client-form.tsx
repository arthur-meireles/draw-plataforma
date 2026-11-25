"use client";
/** Formulário de cliente (criar/editar) — usado na listagem, na ficha e no cadastro rápido do projeto. */
import { useEffect, useState } from "react";
import { Button, Dialog, SelectField, TextField, TextareaField, type Option, useSuccessFlash } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { clientsApi, type ClientInput } from "@/data/services";
import type { Client } from "@/data/types";
import { CLIENT_STATUS_LABEL } from "@/data/reference";
import { formatCnpj, isValidCnpj, onlyDigits } from "@/lib/format";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
const SEGMENTS = ["Escritório de advocacia", "Energia", "Construção civil", "Imobiliário", "Financeiro", "Saúde", "Tecnologia", "Agronegócio", "Terceiro setor", "Varejo", "Setor público", "Seguros", "Logística", "Educação", "Outros"];

const empty: ClientInput = {
  groupId: null,
  legalName: "",
  tradeName: "",
  cnpj: "",
  segment: "",
  status: "ativo",
  notes: "",
  paymentTermsNote: "",
  paymentTermDays: null,
  address: { street: "", number: "", complement: null, district: "", city: "", state: "SP", zip: "" },
};

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; client?: Client | null; onSaved?: (c: Client) => void }) {
  const [form, setForm] = useState<ClientInput>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const groups = useApiQuery(["client-groups"], clientsApi.groups, { enabled: open });

  useEffect(() => {
    if (open) {
      setForm(client ? { groupId: client.groupId, legalName: client.legalName, tradeName: client.tradeName, cnpj: client.cnpj, segment: client.segment, status: client.status, notes: client.notes ?? "", paymentTermsNote: client.paymentTermsNote ?? "", paymentTermDays: client.paymentTermDays, address: client.address } : empty);
      setErrors({});
    }
  }, [open, client]);

  const saved = useSuccessFlash();
  const save = useApiMutation((input: ClientInput) => (client ? clientsApi.update(client.id, input) : clientsApi.create(input)), {
    success: client ? "Cliente atualizado" : "Cliente cadastrado",
    onSuccess: (c) =>
      saved.flash(() => {
        onSaved?.(c);
        onOpenChange(false);
      }),
    onError: (e) => {
      if (e.fieldErrors) {
        setErrors(e.fieldErrors);
        document.getElementById(`client-${Object.keys(e.fieldErrors)[0]}`)?.focus();
      }
    },
  });

  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setAddr = (k: keyof ClientInput["address"], v: string) => setForm((f) => ({ ...f, address: { ...f.address, [k]: v } }));

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.legalName.trim()) errs.legalName = "Informe a razão social";
    if (!isValidCnpj(form.cnpj)) errs.cnpj = onlyDigits(form.cnpj).length !== 14 ? "O CNPJ deve ter 14 dígitos" : "CNPJ inválido: confira os dígitos";
    if (!form.segment) errs.segment = "Escolha o segmento";
    if (form.paymentTermDays != null && (!Number.isInteger(form.paymentTermDays) || form.paymentTermDays < 0 || form.paymentTermDays > 365)) errs.paymentTermDays = "Use um número inteiro de 0 a 365 dias";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`client-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    save.mutate({ ...form, legalName: form.legalName.trim(), tradeName: form.tradeName.trim(), paymentTermsNote: form.paymentTermsNote?.trim() || null });
  };

  const groupOptions: Option[] = (groups.data ?? []).map((g) => ({ value: g.id, label: g.name, description: `${g.clients} empresas` }));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={client ? "Editar cliente" : "Cadastrar cliente"}
      description="CNPJ único por organização. Endereço e grupo econômico são opcionais."
      size="lg"
      dismissible={false}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} success={saved.success} successLabel={client ? "Salvo" : "Cadastrado"} onClick={submit}>
            {client ? "Salvar cliente" : "Cadastrar cliente"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
        className="grid gap-4 sm:grid-cols-2"
      >
        <TextField id="client-cnpj" label="CNPJ" required inputMode="numeric" spellCheck={false} autoFocus placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => set("cnpj", formatCnpj(e.target.value))} error={errors.cnpj} hint="A consulta automática de CNPJ entra na R2." />
        <SelectField label="Status" options={(Object.keys(CLIENT_STATUS_LABEL) as Client["status"][]).map((s) => ({ value: s, label: CLIENT_STATUS_LABEL[s] }))} value={form.status} onChange={(v) => v && set("status", v as Client["status"])} />
        <TextField id="client-legalName" label="Razão social" required containerClassName="sm:col-span-2" value={form.legalName} onChange={(e) => set("legalName", e.target.value)} error={errors.legalName} autoComplete="organization" />
        <TextField label="Nome fantasia" value={form.tradeName} onChange={(e) => set("tradeName", e.target.value)} placeholder="Como a equipe chama o cliente" />
        <SelectField label="Segmento" required error={errors.segment} options={SEGMENTS.map((s) => ({ value: s, label: s }))} value={form.segment || null} onChange={(v) => set("segment", v ?? "")} />
        <SelectField label="Grupo econômico" containerClassName="sm:col-span-2" options={groupOptions} value={form.groupId ?? null} onChange={(v) => set("groupId", v)} placeholder="Sem grupo" clearable />
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-[1fr_7rem]">
          <TextField label="Logradouro" value={form.address.street} onChange={(e) => setAddr("street", e.target.value)} autoComplete="address-line1" />
          <TextField label="Número" value={form.address.number} onChange={(e) => setAddr("number", e.target.value)} />
        </div>
        <TextField label="Complemento" value={form.address.complement ?? ""} onChange={(e) => setAddr("complement", e.target.value)} />
        <TextField label="Bairro" value={form.address.district} onChange={(e) => setAddr("district", e.target.value)} />
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-[1fr_6rem_8rem]">
          <TextField label="Cidade" value={form.address.city} onChange={(e) => setAddr("city", e.target.value)} autoComplete="address-level2" />
          <SelectField label="UF" options={UFS.map((u) => ({ value: u, label: u }))} value={form.address.state} onChange={(v) => setAddr("state", v ?? "")} />
          <TextField label="CEP" inputMode="numeric" value={form.address.zip} onChange={(e) => setAddr("zip", e.target.value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2"))} autoComplete="postal-code" />
        </div>
        <TextField label="Política de pagamento" containerClassName="sm:col-span-2" value={form.paymentTermsNote ?? ""} onChange={(e) => set("paymentTermsNote", e.target.value)} placeholder="Ex.: pagamento em 20 dias após a emissão da NF" hint="Como este cliente costuma pagar. Aparece na ficha do cliente e ao emitir NF." />
        <TextField label="Prazo (dias após a NF)" type="number" inputMode="numeric" min={0} max={365} value={form.paymentTermDays ?? ""} onChange={(e) => set("paymentTermDays", e.target.value === "" ? null : Number(e.target.value))} error={errors.paymentTermDays} hint="Usado para sugerir o vencimento ao emitir a NF." />
        <TextareaField label="Observações" containerClassName="sm:col-span-2" rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </form>
    </Dialog>
  );
}
