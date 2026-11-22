"use client";
/** Aba "Tarefas abertas" (RF-M2-04). */
import { DataTable, type Column } from "@/components/ui";
import { DueChip, PriorityPill, ProjectCode, TaskStatusPill } from "@/components/domain";
import type { FreelancerDetail } from "./use-freelancers";

type Row = FreelancerDetail["openTasks"][number];

export function FreelancerTasksTab({ freelancer: f }: { freelancer: FreelancerDetail }) {
  const columns: Column<Row>[] = [
    { id: "title", header: "Tarefa", mobile: "title", sortValue: (t) => t.title, cell: (t) => <span className="block max-w-96 truncate font-medium text-fg max-md:max-w-none max-md:whitespace-normal">{t.title}</span> },
    { id: "project", header: "Projeto", mobile: "subtitle", sortValue: (t) => t.projectCode, cell: (t) => <ProjectCode code={t.projectCode} /> },
    { id: "status", header: "Status", mobile: "meta", sortValue: (t) => t.statusKey, cell: (t) => <TaskStatusPill value={t.statusKey} size="sm" /> },
    { id: "priority", header: "Prioridade", hideBelow: "md", mobile: "meta", sortValue: (t) => t.priorityKey, cell: (t) => <PriorityPill value={t.priorityKey} size="sm" /> },
    { id: "due", header: "Prazo", mobile: "meta", sortValue: (t) => t.dueAt, cell: (t) => <DueChip date={t.dueAt} size="sm" /> },
  ];
  return (
    <DataTable
      rows={f.openTasks}
      columns={columns}
      getRowId={(t) => t.id}
      rowHref={(t) => `/projetos/${t.projectCode}?aba=tarefas&tarefa=${t.id}`}
      initialSort={{ id: "due", dir: "asc" }}
      empty={{ icon: "myTasks", title: "Nenhuma tarefa aberta", description: "Tudo em dia por aqui. Tarefas atribuídas a este freelancer aparecem nesta lista." }}
    />
  );
}
