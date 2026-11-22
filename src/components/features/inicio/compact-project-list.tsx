"use client";
/** Lista compacta de projetos (entregas da semana, atrasados) para o Início. */
import Link from "next/link";
import { EmptyState, Section, Skeleton, type IconName } from "@/components/ui";
import { DueChip, ProjectCode, ProjectStageLabel } from "@/components/domain";
import type { ProjectStageKey } from "@/data/types";

export interface CompactProject {
  id: string;
  code: string;
  title: string;
  dueAt: string;
  clientName: string;
  stageKey?: ProjectStageKey | null;
}

export function CompactProjectList({ title, icon, items, loading, emptyTitle, emptyDescription, href }: { title: string; icon: IconName; items: CompactProject[] | undefined; loading?: boolean; emptyTitle: string; emptyDescription: string; href?: string }) {
  const sorted = [...(items ?? [])].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return (
    <Section title={title} icon={icon} bodyClassName="p-0" actions={href && sorted.length ? <Link href={href} className="text-xs text-accent hover:underline">Ver todos</Link> : undefined}>
      {loading ? (
        <div className="divide-y divide-line">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : !sorted.length ? (
        <EmptyState compact icon="success" title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="divide-y divide-line">
          {sorted.slice(0, 6).map((p) => (
            <li key={p.id}>
              <Link href={`/projetos/${p.code}`} className="flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-layer-hover/60">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm text-fg">
                    <ProjectCode code={p.code} />
                    <span className="truncate">{p.title}</span>
                  </p>
                  <p className="flex items-center gap-2 truncate text-xs text-fg-subtle">
                    {p.clientName}
                    {p.stageKey && <ProjectStageLabel stageKey={p.stageKey} />}
                  </p>
                </div>
                <DueChip date={p.dueAt} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
