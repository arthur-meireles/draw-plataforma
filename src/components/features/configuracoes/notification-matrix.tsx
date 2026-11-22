"use client";
import { ErrorState, Section, Skeleton, Switch } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { notificationsApi } from "@/data/services";
import type { NotificationType } from "@/data/types";

const TYPES: { type: NotificationType; label: string; description: string }[] = [
  { type: "atribuicao", label: "Atribuição", description: "Quando uma tarefa é atribuída a você" },
  { type: "mencao", label: "Menções", description: "Quando alguém menciona você em um comentário" },
  { type: "prazo", label: "Prazo chegando", description: "Tarefas e entregas perto do vencimento" },
  { type: "atraso", label: "Atrasos", description: "Tarefas que passaram do prazo" },
  { type: "aprovacao", label: "Aprovações", description: "Pedidos e decisões de aprovação" },
  { type: "nf_solicitada", label: "Pedido de nota fiscal", description: "Quando uma NF é solicitada" },
  { type: "nf_recebida", label: "Nota fiscal recebida", description: "Quando um freelancer envia a NF" },
];

/** Matriz tipos × canais (app e e-mail) das notificações (M10). */
export function NotificationMatrix() {
  const q = useApiQuery(["notifications", "preferences"], notificationsApi.preferences);
  const set = useApiMutation((v: { type: NotificationType; channel: "app" | "email"; enabled: boolean }) => notificationsApi.setPreference(v.type, v.channel, v.enabled), { success: false });
  const on = (type: NotificationType, channel: "app" | "email") => q.data?.find((p) => p.type === type && p.channel === channel)?.enabled ?? channel === "app";

  return (
    <Section title="Notificações" description="Escolha o que avisa você no app e por e-mail" icon="notification">
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-8" />
      ) : q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <div>
          <div className="hidden grid-cols-[1fr_5rem_5rem] gap-4 border-b border-line pb-2 text-xs font-medium text-fg-subtle md:grid">
            <span>Tipo</span>
            <span className="text-center">No app</span>
            <span className="text-center">E-mail</span>
          </div>
          <ul className="divide-y divide-line">
            {TYPES.map((t) => (
              <li key={t.type} className="grid items-center gap-x-4 gap-y-2 py-3 md:grid-cols-[1fr_5rem_5rem]">
                <div>
                  <p className="text-sm font-medium text-fg">{t.label}</p>
                  <p className="text-xs text-fg-subtle">{t.description}</p>
                </div>
                <div className="flex items-center justify-between md:justify-center">
                  <span className="text-xs text-fg-muted md:hidden">No app</span>
                  <Switch ariaLabel={`${t.label} no app`} checked={on(t.type, "app")} onCheckedChange={(enabled) => set.mutate({ type: t.type, channel: "app", enabled })} />
                </div>
                <div className="flex items-center justify-between md:justify-center">
                  <span className="text-xs text-fg-muted md:hidden">Por e-mail</span>
                  <Switch ariaLabel={`${t.label} por e-mail`} checked={on(t.type, "email")} onCheckedChange={(enabled) => set.mutate({ type: t.type, channel: "email", enabled })} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
