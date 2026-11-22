"use client";
/** "Minhas tarefas de hoje": atrasadas + vencendo hoje, agrupadas por prazo. */
import Link from "next/link";
import { Section } from "@/components/ui";
import { TaskList } from "@/components/domain";
import { useApiQuery } from "@/data/hooks";
import { tasksApi, type TaskView } from "@/data/services";

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

export function TodayTasks({ onOpen, limit = 8 }: { onOpen: (t: TaskView) => void; limit?: number }) {
  const q = useApiQuery(["tasks", "mine"], () => tasksApi.list({ assignee: "me" }));
  const due = q.data?.filter((t) => t.statusKey !== "concluida" && t.dueAt && new Date(t.dueAt).getTime() <= endOfToday());
  const sorted = due ? [...due].sort((a, b) => a.dueAt!.localeCompare(b.dueAt!)) : undefined;
  return (
    <Section title="Minhas tarefas de hoje" icon="myTasks" bodyClassName="p-0" description={sorted && sorted.length > limit ? `Mostrando ${limit} de ${sorted.length}` : undefined} actions={<Link href="/minhas-tarefas" className="text-xs text-accent hover:underline">Ver todas</Link>}>
      <TaskList tasks={sorted?.slice(0, limit)} isLoading={q.isLoading} error={q.error} onRetry={() => q.refetch()} groupBy="due" onOpen={onOpen} showProject empty={{ icon: "success", title: "Nada vence hoje", description: "Veja o que vem pela frente em Minhas tarefas." }} />
    </Section>
  );
}
