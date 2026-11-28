"use client";
/**
 * Caixa de entrada (RF-M10-01): lista à esquerda, detalhe à direita (desktop/tablet);
 * no celular o detalhe ocupa a tela inteira. Seleção, filtro e tipo vivem na URL.
 */
import { useMemo } from "react";
import { Button, ClearFiltersButton, Combobox, EmptyState, ErrorState, FilterChip, PageHeader, SegmentedControl, Skeleton, Toolbar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { notificationsApi } from "@/data/services";
import type { NotificationType } from "@/data/types";
import { useUrlState } from "@/lib/use-url-state";
import { InboxDetail } from "./inbox-detail";
import { InboxItem, type InboxNotification } from "./inbox-item";
import { notificationMeta, notificationTypeOptions } from "./notification-meta";

type Filter = "todas" | "nao-lidas" | "arquivadas";

function InboxSkeleton() {
  return (
    <div>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex gap-3 border-b border-line px-4 py-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Agrupa por projeto, com o grupo mais recente primeiro (a lista já vem do mais novo para o mais antigo). */
function groupByProject(list: InboxNotification[]) {
  const map = new Map<string, { key: string; code: string | null; items: InboxNotification[] }>();
  for (const n of list) {
    const key = n.projectId ?? "_";
    if (!map.has(key)) map.set(key, { key, code: n.projectCode, items: [] });
    map.get(key)!.items.push(n);
  }
  return [...map.values()];
}

export function InboxView() {
  const [f, set] = useUrlState({ filtro: "todas", tipo: undefined as string | undefined, n: undefined as string | undefined, agrupar: undefined as string | undefined });
  const byProject = f.agrupar === "projeto";
  const filter: Filter = f.filtro === "nao-lidas" || f.filtro === "arquivadas" ? f.filtro : "todas";
  const archivedView = filter === "arquivadas";
  const type = f.tipo && f.tipo in notificationMeta ? (f.tipo as NotificationType) : undefined;

  // a lista também atualiza sozinha (como o contador do menu); arquivadas é uma visão à parte (RN-77)
  const q = useApiQuery(["notifications", "list", archivedView], () => notificationsApi.list({ archived: archivedView }), { refetchInterval: 30_000 });
  const markRead = useApiMutation((v: { id: string; read: boolean }) => notificationsApi.markRead(v.id, v.read), { success: false });
  const markAll = useApiMutation(notificationsApi.markAllRead, { success: "Todas as notificações foram marcadas como lidas" });
  const archiveRead = useApiMutation(notificationsApi.archiveRead, { success: (n: number) => (n ? `${n} notificação(ões) lida(s) arquivada(s). Veja em Arquivadas.` : "Não há notificações lidas para arquivar.") });

  const all = useMemo(() => q.data ?? [], [q.data]);
  const unread = all.filter((n) => !n.readAt).length;
  const list = useMemo(() => all.filter((n) => (filter !== "nao-lidas" || !n.readAt) && (!type || n.type === type)), [all, filter, type]);
  const groups = useMemo(() => groupByProject(list), [list]);
  const selected = f.n ? all.find((n) => n.id === f.n) ?? null : null;

  const select = (n: InboxNotification) => {
    set({ n: n.id });
    if (!n.readAt) markRead.mutate({ id: n.id, read: true });
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Caixa de entrada", icon: "inbox" }]}
        count={q.data && !archivedView ? unread : undefined}
        actions={
          <>
            <Button size="sm" variant="ghost" icon="archive" onClick={() => archiveRead.mutate(undefined)} loading={archiveRead.isPending} disabled={archivedView || !all.some((n) => n.readAt)} className={cn("max-md:hidden", selected && "max-md:hidden")}>
              Arquivar lidas
            </Button>
            <Button size="sm" variant="secondary" icon="check" onClick={() => markAll.mutate(undefined)} loading={markAll.isPending} disabled={!unread || archivedView} className={cn(selected && "max-md:hidden")}>
              <span className="max-sm:hidden">Marcar todas como lidas</span>
              <span className="sm:hidden">Ler todas</span>
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <section aria-label="Notificações" className={cn("flex min-h-0 w-full shrink-0 flex-col border-line md:w-[22rem] md:border-r xl:w-[26rem]", selected && "max-md:hidden")}>
          <Toolbar className="border-b">
            <SegmentedControl<Filter>
              aria-label="Filtrar por leitura"
              value={filter}
              onChange={(v) => set({ filtro: v })}
              options={[
                { value: "todas", label: "Todas" },
                { value: "nao-lidas", label: "Não lidas" },
                { value: "arquivadas", label: "Arquivadas" },
              ]}
            />
            <Combobox<NotificationType>
              options={notificationTypeOptions}
              value={type}
              onChange={(v) => set({ tipo: v ?? undefined })}
              clearable
              align="start"
              aria-label="Filtrar por tipo"
              trigger={<FilterChip label="Tipo" icon="filter" value={type ? notificationMeta[type].label : undefined} onClear={() => set({ tipo: undefined })} />}
            />
            <FilterChip label="Por projeto" icon="project" active={byProject} aria-pressed={byProject} onClick={() => set({ agrupar: byProject ? undefined : "projeto" })} />
            <ClearFiltersButton show={filter !== "todas" || !!type} onClick={() => set({ filtro: undefined, tipo: undefined })} />
          </Toolbar>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin max-md:pb-24">
            {q.error ? (
              <ErrorState error={q.error} onRetry={() => q.refetch()} />
            ) : q.isLoading ? (
              <InboxSkeleton />
            ) : !list.length ? (
              <EmptyState
                icon={all.length ? "search" : "success"}
                title={all.length ? "Nada com esses filtros" : archivedView ? "Nenhuma notificação arquivada" : "Você está em dia"}
                description={all.length ? "Remova os filtros para ver todas as notificações." : archivedView ? "O que você arquivar fica guardado aqui e pode voltar para a caixa." : "Prazos, atrasos, movimentos dos seus projetos e tarefas, menções e respostas de clientes aparecem aqui."}
                action={all.length ? { label: "Limpar filtros", onClick: () => set({ filtro: undefined, tipo: undefined }) } : undefined}
              />
            ) : (
              <ul>
                {byProject
                  ? groups.map((g) => (
                      <li key={g.key}>
                        <p className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                          <span className="font-mono normal-case">{g.code ?? "Sem projeto"}</span>
                          <span className="tabular-nums">· {g.items.length}</span>
                        </p>
                        <ul>
                          {g.items.map((n) => (
                            <InboxItem key={n.id} item={n} selected={n.id === selected?.id} onSelect={select} />
                          ))}
                        </ul>
                      </li>
                    ))
                  : list.map((n) => <InboxItem key={n.id} item={n} selected={n.id === selected?.id} onSelect={select} />)}
              </ul>
            )}
          </div>
        </section>
        <div className={cn("min-w-0 flex-1 flex-col bg-surface", selected ? "flex" : "flex max-md:hidden")}>
          {selected ? (
            <InboxDetail key={selected.id} item={selected} onBack={() => set({ n: undefined })} onClose={() => set({ n: undefined })} />
          ) : (
            <EmptyState icon="inbox" title="Selecione uma notificação" description="Escolha um item da lista para ver o contexto e ir direto ao projeto ou à tarefa." className="m-auto" />
          )}
        </div>
      </div>
    </>
  );
}
