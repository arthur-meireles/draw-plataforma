"use client";
/**
 * Tarefas: linha (com propriedades editáveis inline), lista agrupada, criação rápida,
 * painel lateral de detalhe (peek estilo Plane) com subtarefas e comentários.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Button, Combobox, ConfirmDialog, DateInput, EmptyState, ErrorState, Icon, IconButton, Input, Pill, PropertyRow, RowActions, Sheet, Skeleton, Textarea, ProgressRing, useEntrance, useExitingItems, Collapse } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { tasksApi, type TaskView } from "@/data/services";
import type { AdmArea, ID, PriorityKey, TaskStatusKey } from "@/data/types";
import { fromDateInput, toDateInput } from "@/lib/format";
import { ADM_AREAS, PROJECT_STATUS_LABEL, projectStage, quoteStage } from "@/data/reference";
import { AssigneePill, type PersonRef } from "./pickers";
import { usePermissions } from "@/components/layout/session";
import { DoneTitle, DueChip, PriorityPill, ProjectCode, TaskCheck, TaskStatusIcon, TaskStatusPill } from "./badges";
import { CommentThread, EventTimeline } from "./timeline";

const personOf = (t: Pick<TaskView, "assigneeUserId" | "assigneeFreelancerId">): PersonRef | null => (t.assigneeUserId ? { kind: "user", id: t.assigneeUserId } : t.assigneeFreelancerId ? { kind: "freelancer", id: t.assigneeFreelancerId } : null);

const areaLabel = (area: AdmArea | null) => {
  const a = ADM_AREAS.find((x) => x.key === (area ?? "outros"))!;
  return `${a.number}. ${a.label}`;
};

/** Tempo da micro-interação de conclusão (check + anel + risco) antes de a lista se reorganizar. */
const COMPLETE_SETTLE_MS = 700;

export function useTaskUpdate() {
  return useApiMutation(({ id, patch }: { id: ID; patch: Parameters<typeof tasksApi.update>[1] }) => tasksApi.update(id, patch), {
    // concluir: deixa a animação terminar antes de a tarefa mudar de grupo/sumir da lista (ex.: Minhas tarefas)
    invalidateDelay: ({ patch }) => (patch.statusKey === "concluida" ? COMPLETE_SETTLE_MS : 0),
  });
}

/** Linha de tarefa estilo Plane: status clicável, título, propriedades à direita. */
export function TaskRow({ task: t, onOpen, showProject, restrictAssignees, readOnly, className, style }: { task: TaskView; onOpen?: (t: TaskView) => void; showProject?: boolean; restrictAssignees?: PersonRef[]; readOnly?: boolean; className?: string; style?: React.CSSProperties }) {
  const update = useTaskUpdate();
  // RN-38 — responsável por tarefa ADM muda o status mesmo sem editar o resto
  const statusLocked = !!readOnly && !t.canChangeStatus;
  // conclusão otimista: o círculo responde na hora; volta se a API recusar
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [t.statusKey]);
  const done = optimistic ?? t.statusKey === "concluida";
  const toggleDone = () => {
    const next = !done;
    setOptimistic(next);
    update.mutate({ id: t.id, patch: { statusKey: next ? "concluida" : "a_fazer" } }, { onError: () => setOptimistic(null) });
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(t)}
      onKeyDown={(e) => e.key === "Enter" && onOpen?.(t)}
      style={style}
      className={cn("group flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-line px-4 py-2 last:border-0 hover:bg-layer-hover/60 max-md:flex-wrap max-md:py-3", className)}
    >
      <TaskCheck status={t.statusKey} done={done} disabled={statusLocked} onToggle={toggleDone} />
      {showProject && t.projectCode && <ProjectCode code={t.projectCode} className="w-16 max-md:hidden" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">
          <DoneTitle done={done}>{t.title}</DoneTitle>
        </span>
        {showProject && (
          <span className="block truncate text-xs text-fg-subtle">
            {t.parentTitle && <span title={`Subtarefa de ${t.parentTitle}`}>↳ {t.parentTitle} · </span>}
            {t.projectCode ? (
              <>
                <span className="font-mono md:hidden">{t.projectCode} · </span>
                {t.clientName}
              </>
            ) : (
              "Administrativo"
            )}
            {t.projectOnHold && <span className="text-warning"> · {t.projectStatus === "ativo" ? "projeto parado" : `projeto ${PROJECT_STATUS_LABEL[t.projectStatus!].toLowerCase()}`}</span>}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5 max-md:w-full max-md:pl-9" onClick={(e) => e.stopPropagation()}>
        {t.subtasksTotal > 0 && (
          <span className="inline-flex h-6 items-center gap-1 rounded-md border border-line px-1.5 text-xs text-fg-subtle">
            <ProgressRing value={t.subtasksDone} max={t.subtasksTotal} size={12} />
            {t.subtasksDone}/{t.subtasksTotal}
          </span>
        )}
        {t.commentsCount > 0 && (
          <span className="inline-flex h-6 items-center gap-1 px-1 text-xs text-fg-subtle">
            <Icon name="comment" size="xs" />
            {t.commentsCount}
          </span>
        )}
        <TaskStatusPill value={t.statusKey} onChange={statusLocked ? undefined : (v) => update.mutate({ id: t.id, patch: { statusKey: v } })} showLabel={false} />
        <PriorityPill value={t.priorityKey} onChange={readOnly ? undefined : (v) => update.mutate({ id: t.id, patch: { priorityKey: v } })} showLabel={false} />
        <DueChip date={t.dueAt} done={done || t.projectOnHold} />
        <AssigneePill
          value={personOf(t)}
          name={t.assigneeName}
          color={t.assigneeColor}
          restrictTo={restrictAssignees}
          onChange={readOnly ? undefined : (v) => update.mutate({ id: t.id, patch: v?.kind === "freelancer" ? { assigneeFreelancerId: v.id } : { assigneeUserId: v?.id ?? null } })}
        />
      </span>
    </div>
  );
}

/** Adição rápida inline ("+ Nova tarefa" → título + Enter). */
export function TaskQuickAdd({ projectId, stageKey, module, sprintId, parentTaskId, label = "Nova tarefa", assignee }: { projectId?: ID | null; stageKey?: string | null; module?: "projeto" | "adm"; sprintId?: ID | null; parentTaskId?: ID | null; label?: string; assignee?: PersonRef | null }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const create = useApiMutation(tasksApi.create, { onSuccess: () => setTitle("") });
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-full items-center gap-2 px-4 text-sm text-fg-subtle hover:bg-layer-hover/60 hover:text-fg">
        <Icon name="add" size="sm" />
        {label}
      </button>
    );
  const submit = () => {
    if (!title.trim()) return;
    create.mutate({ projectId: projectId ?? null, module, stageKey: (stageKey ?? undefined) as never, sprintId: sprintId ?? null, parentTaskId: parentTaskId ?? null, title, assigneeUserId: assignee?.kind === "user" ? assignee.id : undefined, assigneeFreelancerId: assignee?.kind === "freelancer" ? assignee.id : undefined });
  };
  return (
    <form
      className="flex items-center gap-2 px-4 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Icon name="stageOpen" size="sm" className="text-fg-subtle" />
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da tarefa e Enter" aria-label="Título da nova tarefa" onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      <Button type="submit" size="sm" variant="primary" loading={create.isPending}>
        Adicionar
      </Button>
      <IconButton icon="close" label="Cancelar" onClick={() => setOpen(false)} />
    </form>
  );
}

/** Lista de tarefas agrupada (por etapa ou status) com skeleton/vazio/erro. */
export function TaskList({ tasks, isLoading, error, onRetry, groupBy = "none", onOpen, showProject, restrictAssignees, quickAdd, empty, readOnly }: {
  tasks: TaskView[] | undefined;
  isLoading?: boolean;
  error?: { message?: string; status?: number } | null;
  onRetry?: () => void;
  groupBy?: "none" | "stage" | "status" | "due" | "project" | "area";
  onOpen?: (t: TaskView) => void;
  showProject?: boolean;
  restrictAssignees?: PersonRef[];
  quickAdd?: React.ComponentProps<typeof TaskQuickAdd>;
  empty?: React.ComponentProps<typeof EmptyState>;
  readOnly?: boolean;
}) {
  const enter = useEntrance();
  // tarefas que saem da lista (ex.: concluídas em "Minhas tarefas") esmaecem e recolhem antes de sumir
  const rows = useExitingItems(tasks, (t) => t.id);
  const exiting = new Set(rows?.filter((r) => r.exiting).map((r) => r.item.id));
  const live = (items: TaskView[]) => items.filter((t) => !exiting.has(t.id)).length;
  tasks = rows?.map((r) => r.item);
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (isLoading || !tasks)
    return (
      <div className="divide-y divide-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    );
  if (!tasks.length)
    return (
      <>
        <EmptyState compact icon="task" title="Nenhuma tarefa" description="Tudo em dia por aqui." {...empty} />
        {quickAdd && <TaskQuickAdd {...quickAdd} />}
      </>
    );

  const groups: { key: string; label: string; icon?: React.ReactNode; items: TaskView[] }[] = [];
  if (groupBy === "none") groups.push({ key: "all", label: "", items: tasks });
  else if (groupBy === "status") {
    (["em_andamento", "em_revisao", "a_fazer", "concluida"] as TaskStatusKey[]).forEach((s) => {
      const items = tasks.filter((t) => t.statusKey === s);
      if (items.length) groups.push({ key: s, label: { a_fazer: "A fazer", em_andamento: "Em andamento", em_revisao: "Em revisão", concluida: "Concluída" }[s], icon: <TaskStatusIcon status={s} />, items });
    });
  } else if (groupBy === "area") {
    ADM_AREAS.forEach((a) => {
      const items = tasks.filter((t) => (t.area ?? "outros") === a.key);
      if (items.length) groups.push({ key: a.key, label: `${a.number}. ${a.label}`, icon: <Icon name="adm" size="sm" className="text-fg-subtle" />, items });
    });
  } else if (groupBy === "project") {
    const keys = [...new Set(tasks.map((t) => t.projectCode ?? ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
    keys.forEach((k) => {
      const items = tasks.filter((t) => (t.projectCode ?? "") === k);
      groups.push({ key: k || "adm", label: k ? `${k} · ${items[0].projectTitle ?? ""}` : "Administrativo", icon: <Icon name={k ? "project" : "adm"} size="sm" className="text-fg-subtle" />, items });
    });
  } else if (groupBy === "stage") {
    const keys = [...new Set(tasks.map((t) => t.stageKey ?? "sem"))];
    const order = (k: string) => projectStage(k as never)?.order ?? quoteStage(k as never)?.order ?? 99;
    keys.sort((a, b) => order(a) - order(b)).forEach((k) => {
      groups.push({ key: k, label: projectStage(k as never)?.label ?? quoteStage(k as never)?.label ?? "Sem etapa", items: tasks.filter((t) => (t.stageKey ?? "sem") === k) });
    });
  } else {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const day = 86_400_000;
    const bucket = (t: TaskView) => {
      // RN-57 — projeto parado/encerrado não infla "Atrasadas"
      if (t.projectOnHold && t.statusKey !== "concluida") return "parados";
      if (!t.dueAt) return "depois";
      const d = new Date(t.dueAt).getTime();
      if (d < now.getTime()) return "atrasadas";
      if (d < now.getTime() + day) return "hoje";
      if (d < now.getTime() + 7 * day) return "semana";
      return "depois";
    };
    const labels = { atrasadas: "Atrasadas", hoje: "Hoje", semana: "Esta semana", depois: "Depois", parados: "Projetos parados ou encerrados" } as const;
    (Object.keys(labels) as (keyof typeof labels)[]).forEach((k) => {
      const items = tasks.filter((t) => bucket(t) === k);
      if (items.length) groups.push({ key: k, label: labels[k], icon: k === "atrasadas" ? <Icon name="warning" size="sm" className="text-danger" /> : undefined, items });
    });
  }

  return (
    <div>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || "Tarefas"}>
          {g.label && (
            <header className="sticky top-0 z-[5] flex h-9 items-center gap-2 border-b border-line bg-surface-2 px-4 text-sm">
              {g.icon}
              <span className="font-medium text-fg">{g.label}</span>
              <span className="text-xs tabular-nums text-fg-subtle">{live(g.items)}</span>
            </header>
          )}
          {g.items.map((t) => {
            const e = enter(t.id);
            return (
              <Collapse key={t.id} exiting={exiting.has(t.id)} className="border-b border-line last:border-0">
                <TaskRow task={t} onOpen={onOpen} showProject={showProject} restrictAssignees={restrictAssignees} readOnly={readOnly} style={e.style} className={cn("border-0", e.className)} />
              </Collapse>
            );
          })}
          {quickAdd && groupBy === "stage" && <TaskQuickAdd {...quickAdd} stageKey={g.key === "sem" ? null : g.key} />}
        </section>
      ))}
      {quickAdd && groupBy !== "stage" && <TaskQuickAdd {...quickAdd} />}
    </div>
  );
}

/** Painel lateral com o detalhe da tarefa (peek). Controlado pela URL no pai (?tarefa=id). */
export function TaskPeek({ taskId, onClose, restrictAssignees }: { taskId: ID | null; onClose: () => void; restrictAssignees?: PersonRef[] }) {
  const q = useApiQuery(["task", taskId], () => tasksApi.get(taskId!), { enabled: !!taskId });
  const update = useTaskUpdate();
  const remove = useApiMutation(tasksApi.remove, { success: "Tarefa excluída", onSuccess: onClose });
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [confirm, setConfirm] = useState(false);
  const t = q.data;

  useEffect(() => {
    if (t) {
      setTitle(t.title);
      setDesc(t.description ?? "");
    }
  }, [t?.id, t?.title, t?.description]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Parameters<typeof tasksApi.update>[1]) => t && update.mutate({ id: t.id, patch: p });
  const ro = t ? !t.canEdit : true;
  const perms = usePermissions();
  // subtarefa só em projeto aberto e com escrita em Tarefas (ou ADM T)
  const canAddSub = !!t && (t.module === "adm" ? perms.canWriteAll("adm") : perms.canWrite("tasks")) && (!t.projectStatus || t.projectStatus === "ativo" || t.projectStatus === "cotacao");

  return (
    <Sheet
      open={!!taskId}
      onOpenChange={(o) => !o && onClose()}
      ariaTitle="Detalhe da tarefa"
      title={t ? <span className="flex items-center gap-2">{t.projectCode ? <Link href={`/projetos/${t.projectCode}?aba=tarefas`} className="font-mono text-xs hover:text-accent">{t.projectCode}</Link> : "Administrativo"}<span className="text-fg-placeholder">/</span><span className="truncate">Tarefa</span></span> : "Tarefa"}
      actions={t && !ro ? <RowActions items={[{ label: "Excluir tarefa…", icon: "delete", destructive: true, onSelect: () => setConfirm(true) }]} /> : undefined}
    >
      {q.isLoading && (
        <div className="space-y-4 p-6">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      )}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {t && (
        <div className="space-y-6 px-5 py-5 md:px-8">
          <div className="space-y-2">
            <textarea
              value={title}
              readOnly={ro}
              rows={1}
              aria-label="Título da tarefa"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== t.title && patch({ title: title.trim() })}
              className="w-full resize-none bg-transparent text-lg font-semibold text-fg outline-none placeholder:text-fg-placeholder"
            />
            <Textarea value={desc} readOnly={ro} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (t.description ?? "") && patch({ description: desc || null })} placeholder="Adicione uma descrição…" rows={3} className="border-transparent bg-transparent px-0 hover:border-transparent focus:border-line focus:px-2.5" aria-label="Descrição" />
          </div>

          <div className="space-y-1 rounded-lg border border-line p-3">
            <PropertyRow label="Status" icon="task">
              <TaskStatusPill value={t.statusKey} onChange={ro && !t.canChangeStatus ? undefined : (v) => patch({ statusKey: v })} />
            </PropertyRow>
            <PropertyRow label="Responsável" icon="user">
              <AssigneePill showName value={personOf(t)} name={t.assigneeName} color={t.assigneeColor} restrictTo={restrictAssignees} onChange={ro ? undefined : (v) => patch(v?.kind === "freelancer" ? { assigneeFreelancerId: v.id } : { assigneeUserId: v?.id ?? null })} />
            </PropertyRow>
            <PropertyRow label="Prioridade" icon="priority">
              <PriorityPill value={t.priorityKey} onChange={ro ? undefined : (v: PriorityKey) => patch({ priorityKey: v })} />
            </PropertyRow>
            <PropertyRow label="Início" icon="date">
              <DateInput value={toDateInput(t.startAt)} disabled={ro} onChange={(e) => patch({ startAt: fromDateInput(e.target.value) })} className="h-7 w-40" aria-label="Data de início" />
            </PropertyRow>
            <PropertyRow label="Prazo" icon="due">
              <div className="flex items-center gap-2">
                <DateInput value={toDateInput(t.dueAt)} disabled={ro} onChange={(e) => patch({ dueAt: fromDateInput(e.target.value) })} className="h-7 w-40" aria-label="Prazo" />
                <DueChip date={t.dueAt} done={t.statusKey === "concluida"} />
              </div>
            </PropertyRow>
            <PropertyRow label="Estimativa" icon="estimate">
              <Input type="text" inputMode="numeric" disabled={ro} defaultValue={t.estimateMinutes ? String(t.estimateMinutes / 60) : ""} onBlur={(e) => patch({ estimateMinutes: e.target.value ? Math.round(Number(e.target.value.replace(",", ".")) * 60) : null })} placeholder="horas" className="h-7 w-24" aria-label="Estimativa em horas" />
            </PropertyRow>
            {t.module === "adm" && (
              <PropertyRow label="Área" icon="adm">
                {ro ? (
                  <span className="text-sm text-fg-muted">{areaLabel(t.area)}</span>
                ) : (
                  <Combobox<AdmArea> options={ADM_AREAS.map((a) => ({ value: a.key, label: `${a.number}. ${a.label}` }))} value={t.area ?? "outros"} onChange={(v) => v && v !== t.area && patch({ area: v })} trigger={<Pill icon="adm">{areaLabel(t.area)}</Pill>} contentClassName="w-60" aria-label="Área da tarefa" />
                )}
              </PropertyRow>
            )}
            {t.stageKey && (
              <PropertyRow label="Etapa" icon="projects">
                <span className="text-sm text-fg-muted">{projectStage(t.stageKey as never)?.label ?? quoteStage(t.stageKey as never)?.label}</span>
              </PropertyRow>
            )}
          </div>

          {!t.parentTaskId && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                Subtarefas
                {t.subtasks.length > 0 && <span className="text-xs font-normal text-fg-subtle">{t.subtasks.filter((s) => s.statusKey === "concluida").length}/{t.subtasks.length}</span>}
              </h3>
              <div className="overflow-hidden rounded-lg border border-line">
                {t.subtasks.map((s) => (
                  <TaskRow key={s.id} task={s} restrictAssignees={restrictAssignees} readOnly={ro && s.assigneeUserId !== null} />
                ))}
                {canAddSub && <TaskQuickAdd projectId={t.projectId} parentTaskId={t.id} module={t.module} label="Adicionar subtarefa" />}
                {!canAddSub && !t.subtasks.length && <p className="px-3 py-2 text-xs text-fg-subtle">Sem subtarefas.</p>}
              </div>
            </section>
          )}

          {t.projectId && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg">Comentários</h3>
              <CommentThread projectId={t.projectId} taskId={t.id} />
            </section>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold text-fg">Atividade</h3>
            <EventTimeline entityType="task" entityId={t.id} compact />
          </section>

          <p className="flex items-center gap-1.5 text-2xs text-fg-subtle">
            {t.assigneeName && <Avatar name={t.assigneeName} color={t.assigneeColor} size="xs" />}
            Criada em {new Date(t.createdAt).toLocaleDateString("pt-BR")} · atualizada {new Date(t.updatedAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Excluir tarefa?" description="A tarefa e suas subtarefas saem das listas. O histórico do projeto é mantido." confirmLabel="Excluir tarefa" destructive loading={remove.isPending} onConfirm={() => t && remove.mutate(t.id)} />
    </Sheet>
  );
}
