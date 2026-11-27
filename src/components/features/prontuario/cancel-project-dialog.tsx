"use client";
import { useEffect, useState } from "react";
import { Money } from "@/components/domain";
import { Button, Callout, Dialog, Skeleton, TextareaField } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { projectClosingApi, projectsApi } from "@/data/services";
import { plural } from "@/lib/format";
import type { ProjectDetail } from "./use-project";

/**
 * "Cancelar projeto…" com prévia do que fica em aberto (RN-73): recebíveis previstos cancelados, NFs já emitidas
 * (seguem cobráveis — o Financeiro é avisado), tarefas abertas, aprovações retiradas e freelancers sem pagamento.
 */
export function CancelProjectDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const preview = useApiQuery(["cancel-preview", project.id], () => projectClosingApi.cancelPreview(project.id), { enabled: open });
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (!open) return;
    setReason("");
    setError(undefined);
  }, [open]);
  const cancel = useApiMutation(() => projectsApi.cancel(project.id, reason), { success: "Projeto cancelado", onSuccess: () => onOpenChange(false), onError: (e) => setError(e.fieldErrors?.reason) });
  const p = preview.data;
  const submit = () => {
    if (!reason.trim()) return setError("Explique por que o projeto foi cancelado");
    cancel.mutate(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancelar ${project.code}?`}
      description="O projeto e todo o histórico continuam consultáveis. Se mudar de ideia, use “Reativar projeto…”."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button variant="destructive" loading={cancel.isPending} onClick={submit}>
            Cancelar projeto
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-fg-muted">
        {preview.isLoading && <Skeleton className="h-20 w-full rounded-lg" />}
        {p && (
          <ul className="list-disc space-y-1 pl-5">
            <li>{p.receivablesToCancel ? `${plural(p.receivablesToCancel, "recebível previsto será cancelado", "recebíveis previstos serão cancelados")};` : "nenhum recebível previsto a cancelar;"}</li>
            {p.openTasks > 0 && <li>{plural(p.openTasks, "tarefa aberta sai", "tarefas abertas saem")} de Minhas tarefas (continuam no projeto);</li>}
            {p.pendingApprovals > 0 && <li>{plural(p.pendingApprovals, "pedido de aprovação pendente é retirado", "pedidos de aprovação pendentes são retirados")} e os links abertos ao cliente são revogados;</li>}
            <li>responsável e equipe são avisados.</li>
          </ul>
        )}
        {p && p.invoicedOpen > 0 && (
          <Callout tone="warning" title={plural(p.invoicedOpen, "NF já emitida segue cobrável", "NFs já emitidas seguem cobráveis")}>
            {p.invoicedOpenCents != null && <>Total de <Money cents={p.invoicedOpenCents} className="font-medium" />. </>}O Financeiro é avisado para cobrar ou cancelar as notas.
          </Callout>
        )}
        {p && p.freelancers.length > 0 && (
          <Callout tone="warning" title="Freelancers ainda sem pagamento">
            {p.freelancers.map((f) => f.name).join(", ")}. Quem cuida de contas a pagar é avisado para avaliar um pagamento proporcional (aba Equipe → “Gerar pagamento”).
          </Callout>
        )}
        <TextareaField label="Motivo do cancelamento" required value={reason} onChange={(e) => setReason(e.target.value)} error={error} placeholder="Explique por que o projeto foi cancelado" rows={3} />
      </div>
    </Dialog>
  );
}
