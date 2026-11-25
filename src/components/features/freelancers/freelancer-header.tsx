"use client";
/** Cabeçalho da ficha do freelancer (RF-M2-04): avatar, especialidades, contato e carga atual. */
import { Avatar, Badge, Icon, Copyable } from "@/components/ui";
import { SpecialtyBadges } from "./specialty-badges";
import type { FreelancerDetail } from "./use-freelancers";

export function FreelancerHeader({ freelancer: f }: { freelancer: FreelancerDetail }) {
  const activeProjects = f.projects.filter((p) => p.memberActive && p.status === "ativo").length;
  return (
    <div className="border-b border-line bg-surface px-4 py-4 md:px-6">
      <div className="flex items-start gap-3">
        <Avatar name={f.name} color={f.avatarColor} size="xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-semibold text-fg">{f.name}</p>
            <Badge tone={f.status === "ativo" ? "success" : "neutral"} dot>
              {f.status === "ativo" ? "Ativo" : "Inativo"}
            </Badge>
            {f.userId && (
              <Badge tone="info" icon="check">
                Tem login
              </Badge>
            )}
          </div>
          <SpecialtyBadges specialties={f.specialties} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="email" size="xs" />
              <Copyable value={f.email} label="E-mail">
                <a href={`mailto:${f.email}`} className="hover:text-fg">{f.email}</a>
              </Copyable>
            </span>
            {f.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="user" size="xs" />
                <Copyable value={f.phone} label="Telefone" />
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Icon name="project" size="xs" />
              {activeProjects} {activeProjects === 1 ? "projeto ativo" : "projetos ativos"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="task" size="xs" />
              {f.openTasks.length} {f.openTasks.length === 1 ? "tarefa aberta" : "tarefas abertas"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
