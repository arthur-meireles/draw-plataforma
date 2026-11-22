"use client";
/** Faixa compacta "Visão geral da empresa" (quadro atual da Draw): casos, projetos internos e pendências. */
import Link from "next/link";
import { Badge, Icon, Skeleton } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { metricsApi } from "@/data/services";
import { plural } from "@/lib/format";

function Figure({ value, label, href }: { value: number; label: string; href: string }) {
  return (
    <Link href={href} className="flex items-baseline gap-1.5 rounded-md px-2 py-1 hover:bg-layer-hover">
      <span className="font-display text-lg font-bold tabular-nums text-fg">{value}</span>
      <span className="text-sm text-fg-muted">{label}</span>
    </Link>
  );
}

export function CompanyOverview() {
  const q = useApiQuery(["metrics", "company-overview"], metricsApi.companyOverview);
  const d = q.data;
  if (q.error) return null;
  return (
    <section aria-label="Visão geral da empresa" className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-xl border border-line bg-surface px-3 py-2">
      <span className="mr-2 flex items-center gap-1.5 font-display text-sm font-bold text-fg">
        <Icon name="adm" size="sm" className="text-fg-subtle" />
        Visão geral da empresa
      </span>
      {q.isLoading || !d ? (
        <Skeleton className="h-7 w-72" />
      ) : (
        <>
          <Figure value={d.cases} label={d.cases === 1 ? "caso" : "casos"} href="/projetos" />
          <span aria-hidden className="text-fg-placeholder">·</span>
          <Figure value={d.internalProjects} label={d.internalProjects === 1 ? "projeto interno" : "projetos internos"} href="/adm/tarefas?vista=area" />
          <span aria-hidden className="text-fg-placeholder">·</span>
          <Figure value={d.pending} label={d.pending === 1 ? "pendência" : "pendências"} href="/adm/tarefas?vista=area" />
          {d.paused > 0 && (
            <Link href="/projetos?situacao=parados" className="ml-1" aria-label={plural(d.paused, "projeto parado", "projetos parados")}>
              <Badge tone="warning" icon="pause">
                {plural(d.paused, "parado", "parados")}
              </Badge>
            </Link>
          )}
        </>
      )}
    </section>
  );
}
