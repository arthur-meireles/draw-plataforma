"use client";
import { useEffect, useState } from "react";
import { Money } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Badge, Button, Checkbox, Dialog, MoneyField, SegmentedControl, Skeleton } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { MEMBER_ROLE_LABEL } from "@/data/reference";
import { projectsApi, projectsExtraApi, type CompletionDecision } from "@/data/services";
import { plural } from "@/lib/format";
import type { ProjectDetail } from "./use-project";

type Choice = { action: CompletionDecision["action"]; amount: number };

/**
 * Prévia do que a conclusão gera (RN-03) e decisão inline de cada freelancer sem valor ou que saiu da equipe (RN-40):
 * informar o valor (vira o acordado) ou marcar "sem pagamento". Ninguém fica de fora em silêncio.
 */
export function CompleteProjectDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { money } = usePermissions();
  const preview = useApiQuery(["completion-preview", project.id], () => projectsExtraApi.completionPreview(project.id), { enabled: open });
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [closeTasks, setCloseTasks] = useState(false);
  const p = preview.data;
  const pending = p?.freelancers.filter((f) => f.needsDecision) ?? [];

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setChoices({});
    setCloseTasks(false);
  }, [open]);

  const choiceOf = (id: string, fallbackAmount: number | null): Choice => choices[id] ?? { action: "pagar", amount: fallbackAmount ?? 0 };
  const decisions = (): CompletionDecision[] =>
    pending.map((f) => {
      const c = choiceOf(f.memberId, f.agreedAmountCents);
      return c.action === "sem_pagamento" ? { memberId: f.memberId, action: "sem_pagamento" } : { memberId: f.memberId, action: "pagar", amountCents: c.amount > 0 ? c.amount : null };
    });

  const complete = useApiMutation(() => projectsApi.complete(project.id, decisions(), { closeOpenTasks: closeTasks }), {
    success: (r) => (r.payablesCreated ? `Projeto concluído · ${plural(r.payablesCreated, "pedido de NF enviado", "pedidos de NF enviados")}` : "Projeto concluído"),
    onSuccess: () => onOpenChange(false),
    onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
  });

  const submit = () => {
    const errs: Record<string, string> = {};
    for (const f of pending) {
      const c = choiceOf(f.memberId, f.agreedAmountCents);
      if (c.action === "pagar" && !(c.amount > 0)) errs[`member:${f.memberId}`] = `Informe o valor de ${f.name} ou marque "sem pagamento"`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    complete.mutate(undefined);
  };

  const willPay = (p?.freelancersWithAmount ?? 0) + pending.filter((f) => choiceOf(f.memberId, f.agreedAmountCents).action === "pagar").length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Concluir ${project.code}?`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" icon="check" loading={complete.isPending} onClick={submit}>
            Concluir projeto
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-fg-muted">
        <p>Ao concluir, o sistema faz o fechamento de uma vez (RN-03). Para cada freelancer com valor combinado ele:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>cria a conta a pagar com o valor combinado, vencendo no dia de pagamento do mês seguinte;</li>
          <li>gera o link seguro para o envio da nota fiscal;</li>
          <li>envia o e-mail de pedido de NF ao freelancer.</li>
        </ul>
        <p>As parcelas “na entrega” ainda previstas passam a vencer hoje e o Financeiro é avisado do que faturar.</p>
        {preview.isLoading && <Skeleton className="h-16 w-full rounded-lg" />}
        {p && (
          <div className="space-y-1 rounded-lg border border-line bg-layer p-3 text-xs">
            <p className="font-medium text-fg">{willPay ? plural(willPay, "pedido de NF será enviado", "pedidos de NF serão enviados") : "Nenhum pedido de NF será enviado"}</p>
            {p.openTasks > 0 && <p>{plural(p.openTasks, "tarefa ainda está aberta", "tarefas ainda estão abertas")}.</p>}
            {p.openTasks > 0 && <Checkbox checked={closeTasks} onCheckedChange={(v) => setCloseTasks(!!v)} label={`Concluir também ${p.openTasks === 1 ? "a tarefa aberta" : `as ${p.openTasks} tarefas abertas`}`} />}
          </div>
        )}
        {pending.length > 0 && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-medium text-fg">Defina o pagamento destes freelancers</legend>
            {pending.map((f) => {
              const c = choiceOf(f.memberId, f.agreedAmountCents);
              const err = errors[`member:${f.memberId}`];
              const set = (patch: Partial<Choice>) => setChoices((all) => ({ ...all, [f.memberId]: { ...c, ...patch } }));
              return (
                <div key={f.memberId} className="space-y-2 rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{f.name}</span>
                    <span className="text-xs">{MEMBER_ROLE_LABEL[f.memberRole]}</span>
                    {!f.active && <Badge tone="warning">Saiu da equipe</Badge>}
                    {f.active && !f.agreedAmountCents && <Badge tone="warning">Sem valor combinado</Badge>}
                  </div>
                  <SegmentedControl
                    aria-label={`Pagamento de ${f.name}`}
                    value={c.action}
                    onChange={(v) => set({ action: v })}
                    options={[
                      { value: "pagar", label: "Gerar pagamento" },
                      { value: "sem_pagamento", label: "Sem pagamento" },
                    ]}
                  />
                  {c.action === "pagar" &&
                    (money ? (
                      <MoneyField label="Valor combinado" required value={c.amount} onChange={(v) => set({ amount: v })} error={err} hint={f.agreedAmountCents ? <>Acordado: <Money cents={f.agreedAmountCents} /></> : "Passa a ser o valor acordado do freelancer."} />
                    ) : (
                      err && <p className="text-xs text-danger">{err}</p>
                    ))}
                  {c.action === "sem_pagamento" && <p className="text-xs">Não gera conta a pagar. Se mudar de ideia, o Financeiro gera depois em A pagar.</p>}
                </div>
              );
            })}
          </fieldset>
        )}
        {project.contractedAmountCents != null && (
          <p className="text-xs text-fg-subtle">
            Valor contratado: <Money cents={project.contractedAmountCents} className="text-fg-muted" />
          </p>
        )}
      </div>
    </Dialog>
  );
}
