"use client";
/**
 * RN-49 — cobrança do cliente: política/prazo de pagamento e contato de cobrança. O Financeiro edita estes dados
 * mesmo sem poder editar o cadastro do cliente.
 */
import { useEffect, useState } from "react";
import { Button, Dialog, DescriptionList, Section, SelectField, TextField } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { clientBillingApi, clientsApi } from "@/data/services";
import type { ClientContact } from "@/data/types";
import type { ClientDetail } from "./use-clients";

/** Quem mantém a cobrança do cliente: cadastro (clients T) ou Financeiro (receivables T). */
export function useCanEditBilling() {
  const { canWriteAll } = usePermissions();
  return { full: canWriteAll("clients"), billing: canWriteAll("clients") || canWriteAll("receivables") };
}

function TermsDialog({ client: c, open, onOpenChange }: { client: ClientDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [note, setNote] = useState("");
  const [days, setDays] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setNote(c.paymentTermsNote ?? "");
    setDays(c.paymentTermDays != null ? String(c.paymentTermDays) : "");
    setErrors({});
  }, [open, c.paymentTermsNote, c.paymentTermDays]);
  const save = useApiMutation(() => clientBillingApi.updateTerms(c.id, { paymentTermsNote: note, paymentTermDays: days === "" ? null : Number(days) }), {
    success: "Condições de pagamento atualizadas.",
    onSuccess: () => onOpenChange(false),
    onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
  });
  const submit = () => {
    const n = days === "" ? null : Number(days);
    if (n != null && (!Number.isInteger(n) || n < 0 || n > 365)) return setErrors({ paymentTermDays: "Use um número inteiro de 0 a 365 dias" });
    setErrors({});
    save.mutate(undefined);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Condições de pagamento"
      description={c.tradeName}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Salvar condições
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
        <TextField label="Política de pagamento" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: pagamento em 20 dias após a emissão da NF" hint="Como este cliente costuma pagar. Aparece ao emitir a NF." />
        <TextField label="Prazo de pagamento (dias)" type="number" inputMode="numeric" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} error={errors.paymentTermDays} hint="Vencimento = gatilho (aprovação ou emissão da NF) + este prazo. Vale para as próximas parcelas e NFs; lançamentos existentes não mudam." />
      </form>
    </Dialog>
  );
}

/** Seção "Cobrança" da visão geral do cliente. */
export function ClientBillingSection({ client: c }: { client: ClientDetail }) {
  const { billing } = useCanEditBilling();
  const [open, setOpen] = useState(false);
  const contact = c.contacts.find((x) => x.isBillingContact) ?? null;
  return (
    <Section
      title="Cobrança"
      icon="invoice"
      actions={
        billing ? (
          <Button size="sm" variant="ghost" icon="edit" onClick={() => setOpen(true)}>
            Editar condições…
          </Button>
        ) : undefined
      }
    >
      <DescriptionList
        columns={1}
        items={[
          { label: "Política de pagamento", value: c.paymentTermsNote || "Não informada" },
          { label: "Prazo de pagamento", value: c.paymentTermDays != null ? `${c.paymentTermDays} dias após o gatilho (aprovação ou NF)` : "Não informado" },
          { label: "Contato de cobrança", value: contact ? contact.name : "Nenhum — cadastre em Contatos" },
          { label: "E-mail de cobrança", hidden: !contact, value: contact?.email, copy: contact?.email },
          { label: "Telefone de cobrança", hidden: !contact?.phone, value: contact?.phone, copy: contact?.phone },
        ]}
      />
      <TermsDialog client={c} open={open} onOpenChange={setOpen} />
    </Section>
  );
}

/** Remover contato pedindo quem assume a cobrança/os projetos (RN-49). */
export function RemoveContactDialog({ client: c, contact, onOpenChange }: { client: ClientDetail; contact: ClientContact | null; onOpenChange: (o: boolean) => void }) {
  const [replacement, setReplacement] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const others = c.contacts.filter((x) => x.id !== contact?.id);
  const usedIn = c.projects.filter((p) => p.billingContactId === contact?.id && (p.status === "ativo" || p.status === "cotacao")).length;
  const needs = !!contact && others.length > 0 && (contact.isBillingContact || usedIn > 0);
  useEffect(() => {
    setReplacement(null);
    setError(undefined);
  }, [contact]);
  const remove = useApiMutation(() => clientsApi.removeContact(contact!.id, replacement), {
    success: (r) => (r.projectsUpdated ? `Contato removido. ${r.projectsUpdated} projeto(s) ${r.replacementId ? "passaram para o novo contato" : "ficaram sem contato de cobrança"}.` : "Contato removido."),
    onSuccess: () => onOpenChange(false),
    onError: (e) => e.fieldErrors?.replacementId && setError(e.fieldErrors.replacementId),
  });
  return (
    <Dialog
      open={!!contact}
      onOpenChange={onOpenChange}
      size="sm"
      title="Remover contato"
      description={contact ? `${contact.name} deixará de aparecer na ficha do cliente.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() => {
              if (needs && !replacement) return setError("Escolha quem assume a cobrança");
              remove.mutate(undefined);
            }}
          >
            Remover contato
          </Button>
        </>
      }
    >
      {needs ? (
        <SelectField
          label={contact?.isBillingContact ? "Novo contato de cobrança" : "Quem assume nos projetos"}
          required
          value={replacement}
          onChange={(v) => {
            setReplacement(v);
            setError(undefined);
          }}
          options={others.map((x) => ({ value: x.id, label: `${x.name} · ${x.email}` }))}
          error={error}
          hint={usedIn ? `${usedIn} projeto(s) em aberto usam este contato para cobrança e passam para o escolhido.` : "Ele passa a receber as cobranças deste cliente."}
        />
      ) : (
        <p className="text-sm text-fg-muted">{contact?.isBillingContact || usedIn ? "Não há outro contato neste cliente: os projetos ficam sem contato de cobrança até você cadastrar um." : "Nenhum projeto usa este contato."}</p>
      )}
    </Dialog>
  );
}
