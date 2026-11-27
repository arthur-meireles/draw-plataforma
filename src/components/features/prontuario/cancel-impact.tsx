"use client";
/** RN-68 — o que o cancelamento faz no financeiro do projeto (mostrado no diálogo "Cancelar projeto"). */
import { Callout, Skeleton } from "@/components/ui";
import { Money } from "@/components/domain";
import { useApiQuery } from "@/data/hooks";
import { projectFinanceImpactApi } from "@/data/services";
import { PAYABLE_STATUS_LABEL } from "@/data/reference";

export function CancelImpactNote({ projectId, open }: { projectId: string; open: boolean }) {
  const q = useApiQuery(["cancel-impact", projectId], () => projectFinanceImpactApi.cancellationImpact(projectId), { enabled: open, retry: false });
  const i = q.data;
  if (q.isLoading) return <Skeleton className="h-16 w-full" />;
  if (!i) return <span>Recebíveis ainda previstos são cancelados. O projeto e todo o histórico continuam consultáveis.</span>;
  const pending = i.invoicedOpen.length + i.openPayables.length;
  return (
    <div className="space-y-3">
      <p>
        {i.receivablesToCancel ? (
          <>
            {i.receivablesToCancel} recebível(is) previsto(s) {i.receivablesToCancelCents != null && <>(<Money cents={i.receivablesToCancelCents} />)</>} serão cancelados.{" "}
          </>
        ) : null}
        O projeto e todo o histórico continuam consultáveis.
      </p>
      {pending > 0 && (
        <Callout tone="warning" title="Ficam pendências para o Financeiro decidir">
          <span className="block space-y-1">
            {i.invoicedOpen.map((r) => (
              <span key={r.id} className="block">
                NF {r.invoiceNumber ?? "—"} · {r.description} {r.amountCents != null && <>· <Money cents={r.amountCents} /></>} — emitida, sem baixa{r.overdue ? " (vencida)" : ""}
              </span>
            ))}
            {i.openPayables.map((x) => (
              <span key={x.id} className="block">
                {x.freelancerName ?? x.description} · {PAYABLE_STATUS_LABEL[x.status]} {x.amountCents != null && <>· <Money cents={x.amountCents} /></>}
              </span>
            ))}
            <span className="block text-xs">O Financeiro é avisado na Caixa de entrada para cobrar ou cancelar a NF e pagar ou recusar as contas.</span>
          </span>
        </Callout>
      )}
    </div>
  );
}
