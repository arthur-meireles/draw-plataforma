"use client";
/**
 * RN-43 — gera a conta a pagar + pedido de NF de um freelancer da equipe sem depender da conclusão.
 * Usado em /financeiro/pagar ("Novo pagamento a freelancer…") e no prontuário (Equipe › "Gerar pagamento / pedido de NF…").
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Callout, Checkbox, DateField, Dialog, MoneyField, SelectField, TextField } from "@/components/ui";
import { useApiMutation, useApiQuery, useOrganization } from "@/data/hooks";
import { MEMBER_ROLE_LABEL } from "@/data/reference";
import { financeApi, projectsApi, payablesExtraApi } from "@/data/services";
import type { ID } from "@/data/types";
import { fromDateInput } from "@/lib/format";

const PAYABLE_PROJECT_STATUSES = new Set(["ativo", "concluido", "arquivado", "cancelado"]);

export function FreelancerPaymentDialog({ open, onOpenChange, projectId: fixedProject, memberId: fixedMember }: { open: boolean; onOpenChange: (o: boolean) => void; projectId?: ID; memberId?: ID }) {
  const [projectId, setProjectId] = useState<string | null>(fixedProject ?? null);
  const [memberId, setMemberId] = useState<string | null>(fixedMember ?? null);
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [additional, setAdditional] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setProjectId(fixedProject ?? null);
    setMemberId(fixedMember ?? null);
    setAmount(0);
    setDue("");
    setDescription("");
    setAdditional(false);
    setErrors({});
  }, [open, fixedProject, fixedMember]);

  const org = useOrganization();
  const projects = useApiQuery(["projects", "options"], () => projectsApi.list(), { enabled: open && !fixedProject });
  const members = useApiQuery(["project-members", projectId], () => projectsApi.members(projectId!), { enabled: open && !!projectId });
  const payables = useApiQuery(["finance", "payables", "project", projectId], () => financeApi.payables({ projectId: projectId! }), { enabled: open && !!projectId });

  const freelancers = useMemo(() => (members.data ?? []).filter((m) => m.kind === "freelancer"), [members.data]);
  const member = freelancers.find((m) => m.id === memberId) ?? null;
  const existing = (payables.data ?? []).filter((p) => p.projectMemberId === memberId);

  // ao escolher o freelancer, sugere o valor acordado
  useEffect(() => {
    if (member && !existing.length) setAmount(member.agreedAmountCents ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const m = useApiMutation(
    () => payablesExtraApi.createFreelancerPayment({ projectId: projectId!, memberId: memberId!, amountCents: amount, dueAt: due ? fromDateInput(due) : null, description: description.trim() || null, additional }),
    {
      success: "Conta a pagar criada e pedido de NF enviado ao freelancer",
      onSuccess: () => onOpenChange(false),
      onError: (e) => e.fieldErrors && setErrors({ memberId: e.fieldErrors.memberId ?? "", amount: e.fieldErrors.amountCents ?? "", additional: e.fieldErrors.additional ?? "" }),
    },
  );

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!projectId) errs.projectId = "Escolha o projeto";
    if (!memberId) errs.memberId = "Escolha o freelancer da equipe";
    if (amount <= 0) errs.amount = "Informe o valor a pagar";
    if (existing.length && !additional) errs.additional = "Este freelancer já tem conta a pagar neste projeto. Marque se for um pagamento adicional.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(undefined);
  };

  const day = org.data?.org.settings.freelancerPaymentDay ?? 20;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pagamento a freelancer"
      description="Cria a conta a pagar aguardando NF, gera o link seguro e envia o pedido de nota fiscal por e-mail ao freelancer."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon="send" loading={m.isPending} onClick={submit}>
            Gerar pagamento e pedir NF
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!fixedProject && (
          <SelectField
            label="Projeto"
            required
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              setMemberId(null);
            }}
            error={errors.projectId || undefined}
            placeholder={projects.isLoading ? "Carregando projetos…" : "Escolha o projeto"}
            searchPlaceholder="Buscar projeto…"
            options={(projects.data ?? []).filter((p) => PAYABLE_PROJECT_STATUSES.has(p.status)).map((p) => ({ value: p.id, label: `${p.code} · ${p.title}`, keywords: [p.code] }))}
          />
        )}
        {!fixedMember && (
          <SelectField
            label="Freelancer da equipe"
            required
            value={memberId}
            onChange={setMemberId}
            error={errors.memberId || undefined}
            placeholder={!projectId ? "Escolha o projeto primeiro" : members.isLoading ? "Carregando equipe…" : freelancers.length ? "Escolha o freelancer" : "Nenhum freelancer na equipe"}
            searchPlaceholder="Buscar freelancer…"
            disabled={!projectId}
            options={freelancers.map((f) => ({ value: f.id, label: `${f.name} · ${MEMBER_ROLE_LABEL[f.memberRole]}${f.active ? "" : " (saiu da equipe)"}`, keywords: [f.name] }))}
          />
        )}
        {fixedMember && member && (
          <p className="text-sm text-fg-muted">
            <span className="font-medium text-fg">{member.name}</span> · {MEMBER_ROLE_LABEL[member.memberRole]}
          </p>
        )}
        {existing.length > 0 && (
          <div className="space-y-2">
            <Callout tone="warning" title="Já existe pagamento para este freelancer">
              Este projeto já tem {existing.length === 1 ? "uma conta a pagar" : `${existing.length} contas a pagar`} para essa pessoa. Para não duplicar, só crie outra se for um valor extra combinado.
            </Callout>
            <Checkbox checked={additional} onCheckedChange={setAdditional} label="É um pagamento adicional" description="Não altera o valor acordado do membro." />
            {errors.additional && (
              <p role="alert" className="text-xs text-danger">
                {errors.additional}
              </p>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField label="Valor a pagar" required value={amount} onChange={setAmount} error={errors.amount || undefined} hint={!additional ? "Passa a ser o valor acordado do freelancer." : undefined} />
          <DateField label="Vencimento" value={due} onChange={(e) => setDue(e.target.value)} hint={`Em branco: dia ${day} do mês seguinte (RN-06).`} />
        </div>
        <TextField label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Em branco: função e código do projeto" />
      </form>
    </Dialog>
  );
}
