"use client";
/** RN-88 — "Inativar freelancer": mostra o que ainda depende dele (projetos ativos, tarefas e contas em aberto) antes de confirmar. */
import { Callout, ConfirmDialog, Skeleton } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { freelancerLifecycleApi } from "@/data/services";
import { plural } from "@/lib/format";

export function InactivateFreelancerDialog({ freelancer, onOpenChange, onConfirm, loading }: { freelancer: { id: string; name: string } | null; onOpenChange: (o: boolean) => void; onConfirm: () => void; loading?: boolean }) {
  const impact = useApiQuery(["freelancer-impact", freelancer?.id], () => freelancerLifecycleApi.inactivationImpact(freelancer!.id), { enabled: !!freelancer, retry: false });
  const i = impact.data;
  const pending = i ? i.activeProjects.length + i.openTasks + i.openPayables : 0;
  return (
    <ConfirmDialog
      open={!!freelancer}
      onOpenChange={onOpenChange}
      title="Inativar freelancer"
      description={
        freelancer && (
          <span className="block space-y-3">
            <span className="block">{freelancer.name} deixa de aparecer nas alocações novas. O histórico de projetos e pagamentos é mantido.</span>
            {impact.isLoading ? (
              <Skeleton className="h-14 w-full rounded-lg" />
            ) : i && pending > 0 ? (
              <Callout tone="warning" title="Ainda há trabalho em andamento com esta pessoa">
                <ul className="list-disc pl-4">
                  {i.activeProjects.length > 0 && <li>{plural(i.activeProjects.length, "projeto ativo", "projetos ativos")}: {i.activeProjects.map((p) => p.code).join(", ")}</li>}
                  {i.openTasks > 0 && <li>{plural(i.openTasks, "tarefa aberta", "tarefas abertas")}</li>}
                  {i.openPayables > 0 && <li>{plural(i.openPayables, "conta a pagar em aberto", "contas a pagar em aberto")}</li>}
                </ul>
                <span className="mt-1 block">Elas continuam com a pessoa; reatribua ou pague antes se for o caso.</span>
              </Callout>
            ) : null}
          </span>
        )
      }
      confirmLabel="Inativar freelancer"
      destructive
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}
