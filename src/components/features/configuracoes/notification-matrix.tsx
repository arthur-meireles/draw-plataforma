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

/**
 * O que chega na sua Caixa de entrada (M10). Notificações são só dentro do sistema — não há e-mail interno.
 * Menções sempre chegam (não dá para desligar); os demais tipos podem ser silenciados.
 */
export function NotificationMatrix() {
  const q = useApiQuery(["notifications", "preferences"], notificationsApi.preferences);
  const set = useApiMutation((v: { type: NotificationType; enabled: boolean }) => notificationsApi.setPreference(v.type, v.enabled), { success: false });
  const on = (type: NotificationType) => q.data?.find((p) => p.type === type)?.enabled ?? true;

  return (
    <Section title="Caixa de entrada" description="Escolha o que chega na sua caixa de entrada. Os avisos ficam só dentro da plataforma." icon="notification">
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} className="py-8" />
      ) : q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {TYPES.map((t) => {
            const locked = t.type === "mencao";
            return (
              <li key={t.type} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{t.label}</p>
                  <p className="text-xs text-fg-subtle">{locked ? `${t.description} — sempre ativo` : t.description}</p>
                </div>
                <Switch ariaLabel={`Receber ${t.label.toLowerCase()} na caixa de entrada`} checked={locked || on(t.type)} disabled={locked} onCheckedChange={(enabled) => set.mutate({ type: t.type, enabled })} />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
