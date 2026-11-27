"use client";
import { useEffect, useState } from "react";
import { Button, Callout, Dialog, ErrorState, SelectField, Skeleton } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { usersExtraApi } from "@/data/services";

/**
 * Inativar usuário com reatribuição (RN-36): mostra o que a pessoa ainda tem (projetos em que é responsável,
 * tarefas abertas, equipes) e pede quem assume. Sem projetos, reatribuir as tarefas é opcional.
 */
export function DeactivateUserDialog({ user, onClose }: { user: { id: string; name: string } | null; onClose: () => void }) {
  const impact = useApiQuery(["users", "deactivation-impact", user?.id], () => usersExtraApi.deactivationImpact(user!.id), { enabled: !!user, retry: false });
  const [heir, setHeir] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    setHeir(null);
    setError(undefined);
  }, [user?.id]);

  const run = useApiMutation((v: { id: string; reassignTo: string | null }) => usersExtraApi.deactivate(v.id, { reassignTo: v.reassignTo }), {
    success: (r) => (r.projects || r.tasks ? `Usuário inativado. ${r.projects} projeto(s) e ${r.tasks} tarefa(s) reatribuídos.` : "Usuário inativado"),
    onSuccess: onClose,
    onError: (e) => setError(e.fieldErrors?.reassignTo ?? e.message),
  });

  const d = impact.data;
  const needsHeir = !!d && d.projects.length > 0;
  const submit = () => {
    if (!user) return;
    if (needsHeir && !heir) return setError("Escolha quem assume os projetos");
    run.mutate({ id: user.id, reassignTo: heir });
  };

  return (
    <Dialog
      open={!!user}
      onOpenChange={(o) => !o && onClose()}
      title={`Inativar ${user?.name ?? ""}?`}
      description="A pessoa perde o acesso na hora (a sessão aberta cai). O histórico é mantido e você pode reativá-la depois."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" loading={run.isPending} disabled={!d} onClick={submit}>
            Inativar usuário
          </Button>
        </>
      }
    >
      {impact.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-10" />
        </div>
      ) : impact.error ? (
        <ErrorState error={impact.error} onRetry={() => impact.refetch()} className="py-6" />
      ) : d ? (
        <div className="space-y-4">
          {d.projects.length || d.tasks.length || d.memberships ? (
            <Callout tone="warning" icon="warning" title="Pendências desta pessoa">
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {d.projects.length > 0 && <li>Responsável por {d.projects.length} projeto(s): {d.projects.slice(0, 4).map((p) => p.code).join(", ")}{d.projects.length > 4 ? "…" : ""}</li>}
                {d.tasks.length > 0 && <li>{d.tasks.length} tarefa(s) aberta(s) atribuída(s)</li>}
                {d.memberships > 0 && <li>Participa de {d.memberships} equipe(s) de projeto — sai delas ao inativar</li>}
              </ul>
            </Callout>
          ) : (
            <Callout tone="info">Esta pessoa não tem projetos, tarefas abertas nem equipes pendentes.</Callout>
          )}
          {(d.projects.length > 0 || d.tasks.length > 0) && (
            <SelectField
              label={needsHeir ? "Quem assume os projetos e as tarefas" : "Quem assume as tarefas (opcional)"}
              required={needsHeir}
              placeholder={needsHeir ? "Escolha uma pessoa" : "Deixar as tarefas sem responsável"}
              options={d.candidates.map((c) => ({ value: c.id, label: c.name, description: ROLE_LABEL[c.role] }))}
              value={heir ?? undefined}
              onChange={(v) => {
                setHeir(v ?? null);
                setError(undefined);
              }}
              error={error}
              hint="Quem assume recebe um aviso na Caixa de entrada."
            />
          )}
          {error && !(d.projects.length > 0 || d.tasks.length > 0) && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
