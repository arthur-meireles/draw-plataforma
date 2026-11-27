"use client";
import { useState } from "react";
import { Button, ConfirmDialog, DropdownMenu, IconButton, type MenuItem } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { projectLifecycleApi, projectsApi } from "@/data/services";
import { toast } from "sonner";
import { CompleteProjectDialog } from "./complete-project-dialog";
import { UndoApprovalDialog } from "./undo-approval-dialog";
import { CancelProjectDialog } from "./cancel-project-dialog";
import type { ProjectDetail } from "./use-project";

type Pending = "lost" | "cancel" | "complete" | "archive" | "pause" | "undoApproval" | "reopenDone" | "reactivate" | null;

/** Ações do cabeçalho conforme status e permissão; secundárias no menu. */
export function ProjectActions({ project, onNewProposal }: { project: ProjectDetail; onNewProposal: () => void }) {
  const { canWriteAll, money } = usePermissions();
  const [pending, setPending] = useState<Pending>(null);
  const close = () => setPending(null);
  const lost = useApiMutation((reason: string) => projectsApi.markLost(project.id, reason), { success: "Cotação marcada como perdida", onSuccess: close });
  const archive = useApiMutation(() => projectsApi.archive(project.id), { success: "Projeto arquivado. Nada foi apagado.", onSuccess: close });
  const pause = useApiMutation((reason: string) => projectsApi.pause(project.id, reason), { success: "Projeto marcado como parado", onSuccess: close });
  const resume = useApiMutation(() => projectsApi.resume(project.id), { success: "Projeto retomado" });
  const unarchive = useApiMutation(() => projectsApi.unarchive(project.id), { success: "Projeto desarquivado" });
  const reopen = useApiMutation(() => projectsApi.reopenQuote(project.id), { success: "Cotação reaberta em Negociação" });
  const reopenDone = useApiMutation((reason: string) => projectLifecycleApi.reopenCompleted(project.id, reason), { success: "Projeto reaberto em “Com cliente para validação”", onSuccess: close });
  const reactivate = useApiMutation((reason: string) => projectLifecycleApi.reactivateCancelled(project.id, reason), { success: "Projeto reativado", onSuccess: close });

  const manage = canWriteAll("projects");
  const commercial = canWriteAll("commercial");
  const s = project.status;
  const items: MenuItem[] = [
    { label: "Nova proposta", icon: "proposal", hidden: !(s === "cotacao" && commercial && money), onSelect: onNewProposal },
    { label: "Marcar como perdida…", icon: "stageLost", destructive: true, hidden: !(s === "cotacao" && commercial), onSelect: () => setPending("lost") },
    { label: "Pausar projeto…", icon: "pause", hidden: !(s === "ativo" && manage && !project.pausedAt), onSelect: () => setPending("pause") },
    { label: "Retomar projeto", icon: "resume", hidden: !(s === "ativo" && manage && !!project.pausedAt), onSelect: () => resume.mutate(undefined) },
    { label: "Cancelar projeto…", icon: "close", destructive: true, hidden: !(s === "ativo" && manage), onSelect: () => setPending("cancel") },
    { label: "Desfazer aprovação…", icon: "undo", destructive: true, hidden: !(s === "ativo" && project.origin === "cotacao" && commercial && manage && money), onSelect: () => setPending("undoApproval") },
    { label: "Reabrir cotação", icon: "restore", hidden: !(s === "perdido" && commercial), onSelect: () => reopen.mutate(undefined) },
    { label: "Reabrir projeto…", icon: "restore", hidden: !(s === "concluido" && manage), onSelect: () => setPending("reopenDone") },
    { label: "Reativar projeto…", icon: "restore", hidden: !(s === "cancelado" && manage), onSelect: () => setPending("reactivate") },
    { label: "Arquivar", icon: "archive", hidden: !(["concluido", "perdido", "cancelado"].includes(s) && manage), onSelect: () => setPending("archive") },
    {
      label: "Copiar link do projeto",
      icon: "link",
      separatorBefore: true,
      onSelect: () => {
        navigator.clipboard?.writeText(`${location.origin}/projetos/${project.code}`).then(() => toast.success("Link copiado"), () => toast.error("Não foi possível copiar o link"));
      },
    },
  ];

  return (
    <>
      {s === "cotacao" && commercial && money && (
        <Button size="sm" variant="primary" icon="add" onClick={onNewProposal} className="max-md:hidden">
          Nova proposta
        </Button>
      )}
      {s === "ativo" && manage && !project.pausedAt && (
        <Button size="sm" icon="pause" onClick={() => setPending("pause")} className="max-md:hidden">
          Pausar projeto…
        </Button>
      )}
      {s === "ativo" && manage && (
        <Button size="sm" variant="primary" icon="stageDone" onClick={() => setPending("complete")}>
          <span className="max-sm:hidden">Concluir projeto…</span>
          <span className="sm:hidden">Concluir…</span>
        </Button>
      )}
      {["concluido", "perdido", "cancelado"].includes(s) && manage && (
        <Button size="sm" icon="archive" onClick={() => setPending("archive")}>
          Arquivar
        </Button>
      )}
      {s === "arquivado" && manage && (
        <Button size="sm" icon="unarchive" loading={unarchive.isPending} onClick={() => unarchive.mutate(undefined)}>
          Desarquivar
        </Button>
      )}
      <DropdownMenu label="Mais ações do projeto" trigger={<IconButton icon="more" label="Mais ações do projeto" variant="secondary" />} items={items} />

      <ConfirmDialog
        open={pending === "lost"}
        onOpenChange={(o) => !o && close()}
        title={`Marcar ${project.code} como perdida?`}
        description="A cotação sai do funil ativo. Propostas enviadas ficam como recusadas e você pode reabrir depois."
        confirmLabel="Marcar como perdida"
        destructive
        reason={{ label: "Motivo da perda", placeholder: "Ex.: cliente fechou com outro fornecedor, orçamento cortado…", required: true }}
        loading={lost.isPending}
        onConfirm={(r) => lost.mutate(r ?? "")}
      />
      <ConfirmDialog
        open={pending === "pause"}
        onOpenChange={(o) => !o && close()}
        title={`Pausar ${project.code}?`}
        description="O projeto continua na mesma etapa, mas fica marcado como parado e deixa de gerar alertas de prazo. Você pode retomar quando quiser."
        confirmLabel="Pausar projeto"
        reason={{ label: "Motivo da pausa", placeholder: "Ex.: aguardando retorno do cliente, documentos pendentes…", required: true }}
        loading={pause.isPending}
        onConfirm={(r) => pause.mutate(r ?? "")}
      />
      <CancelProjectDialog project={project} open={pending === "cancel"} onOpenChange={(o) => !o && close()} />
      <ConfirmDialog
        open={pending === "archive"}
        onOpenChange={(o) => !o && close()}
        title={`Arquivar ${project.code}?`}
        description="Arquivar tira o projeto das listas do dia a dia, mas não apaga nada: arquivos, financeiro e histórico seguem acessíveis (RN-07)."
        confirmLabel="Arquivar projeto"
        loading={archive.isPending}
        onConfirm={() => archive.mutate(undefined)}
      />
      <ConfirmDialog
        open={pending === "reopenDone"}
        onOpenChange={(o) => !o && close()}
        title={`Reabrir ${project.code}?`}
        description="O projeto volta a ativo na etapa “Com cliente para validação”. As contas a pagar e os pedidos de NF já gerados continuam valendo; ao concluir de novo, só freelancers ainda sem pagamento entram no fechamento."
        confirmLabel="Reabrir projeto"
        reason={{ label: "Motivo da reabertura", placeholder: "Ex.: cliente pediu ajuste depois da entrega", required: true }}
        loading={reopenDone.isPending}
        onConfirm={(r) => reopenDone.mutate(r ?? "")}
      />
      <ConfirmDialog
        open={pending === "reactivate"}
        onOpenChange={(o) => !o && close()}
        title={`Reativar ${project.code}?`}
        description="O projeto volta a ativo na mesma etapa e os recebíveis cancelados junto com ele voltam a previstos."
        confirmLabel="Reativar projeto"
        reason={{ label: "Motivo da reativação", placeholder: "Ex.: cliente retomou o contrato", required: true }}
        loading={reactivate.isPending}
        onConfirm={(r) => reactivate.mutate(r ?? "")}
      />
      <UndoApprovalDialog project={project} open={pending === "undoApproval"} onOpenChange={(o) => !o && close()} />
      <CompleteProjectDialog project={project} open={pending === "complete"} onOpenChange={(o) => !o && close()} />
    </>
  );
}
