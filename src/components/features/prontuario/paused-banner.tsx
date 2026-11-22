"use client";
import { Button, Callout } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { projectsApi } from "@/data/services";
import { dateFull } from "@/lib/format";
import type { ProjectDetail } from "./use-project";

/** Faixa de "Caso parado": mostra o motivo e, para quem gerencia projetos, a ação de retomar. */
export function PausedBanner({ project }: { project: ProjectDetail }) {
  const { canWriteAll } = usePermissions();
  const resume = useApiMutation(() => projectsApi.resume(project.id), { success: "Projeto retomado" });
  if (!project.pausedAt) return null;
  return (
    <Callout
      tone="warning"
      icon="pause"
      title={`Projeto parado desde ${dateFull(project.pausedAt)}`}
      className="mx-4 mb-1 md:mx-6"
    >
      <span className="block">{project.pausedReason ? `Motivo: ${project.pausedReason}` : "Sem motivo registrado."}</span>
      <span className="block text-xs text-fg-subtle">Enquanto estiver parado, o prazo não gera alerta de atraso.</span>
      {canWriteAll("projects") && project.status === "ativo" && (
        <Button size="sm" icon="resume" className="mt-2" loading={resume.isPending} onClick={() => resume.mutate(undefined)}>
          Retomar projeto
        </Button>
      )}
    </Callout>
  );
}
