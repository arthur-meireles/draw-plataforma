"use client";
import { useEffect, useState } from "react";
import { Button, Callout, Checkbox, Dialog, Skeleton, TextareaField } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { projectLifecycleApi } from "@/data/services";
import { plural } from "@/lib/format";
import type { ProjectDetail } from "./use-project";

/**
 * "Desfazer aprovação…" (RN-58): mostra o que sai (recebíveis previstos, tarefas abertas) ou o bloqueio
 * (NF emitida, recebimento, conta a pagar). Motivo obrigatório.
 */
export function UndoApprovalDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const preview = useApiQuery(["undo-approval-preview", project.id], () => projectLifecycleApi.undoApprovalPreview(project.id), { enabled: open });
  const [reason, setReason] = useState("");
  const [keepTasks, setKeepTasks] = useState(false);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (!open) return;
    setReason("");
    setKeepTasks(false);
    setError(undefined);
  }, [open]);

  const undo = useApiMutation(() => projectLifecycleApi.undoApproval(project.id, { reason, keepTasks }), {
    success: "Aprovação desfeita. O projeto voltou para a cotação em Negociação.",
    onSuccess: () => onOpenChange(false),
    onError: (e) => setError(e.fieldErrors?.reason),
  });
  const p = preview.data;
  const submit = () => {
    if (!reason.trim()) return setError("Informe por que a aprovação está sendo desfeita");
    undo.mutate(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Desfazer a aprovação de ${project.code}?`}
      description="Use quando a proposta foi aprovada por engano. O projeto volta para a cotação."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {p?.allowed && (
            <Button variant="destructive" icon="undo" loading={undo.isPending} onClick={submit}>
              Desfazer aprovação
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm text-fg-muted">
        {preview.isLoading && <Skeleton className="h-20 w-full rounded-lg" />}
        {p && !p.allowed && (
          <Callout tone="danger" title="Não dá para desfazer agora">
            <ul className="list-disc space-y-1 pl-5">
              {p.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Callout>
        )}
        {p?.allowed && (
          <>
            <ul className="list-disc space-y-1 pl-5">
              <li>a proposta {p.proposalVersion ? `v${p.proposalVersion} ` : ""}volta a “enviada” e pode ser aprovada de novo;</li>
              <li>{p.receivables ? `${plural(p.receivables, "recebível previsto sai", "recebíveis previstos saem")} do Financeiro;` : "nenhum recebível é afetado;"}</li>
              <li>{p.openTasks ? `${plural(p.openTasks, "tarefa aberta de execução", "tarefas abertas de execução")} ${keepTasks ? "continua(m) no projeto" : "sai(em) do projeto"};` : "não há tarefas abertas de execução;"}</li>
              <li>pedidos de aprovação pendentes do cliente são retirados e o histórico registra o motivo.</li>
            </ul>
            {p.openTasks > 0 && <Checkbox checked={keepTasks} onCheckedChange={setKeepTasks} label="Manter as tarefas no projeto" />}
            <TextareaField label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} error={error} placeholder="Ex.: aprovei a versão errada da proposta" rows={3} />
          </>
        )}
      </div>
    </Dialog>
  );
}
