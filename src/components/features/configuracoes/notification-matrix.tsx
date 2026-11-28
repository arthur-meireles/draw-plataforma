"use client";
import { ErrorState, Section, Skeleton, Switch } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { notificationsApi } from "@/data/services";
import type { NotificationType } from "@/data/types";

const TYPES: { type: NotificationType; label: string; description: string }[] = [
  { type: "atribuicao", label: "Atribuição", description: "Quando você vira responsável por um projeto, entra numa equipe ou recebe uma tarefa" },
  { type: "mencao", label: "Menções", description: "Quando alguém menciona você em um comentário" },
  { type: "prazo", label: "Prazo chegando", description: "Tarefas, entregas e documentos perto do vencimento" },
  { type: "atraso", label: "Atrasos", description: "Tarefas, projetos, documentos e recebimentos que passaram do prazo" },
  { type: "aprovacao", label: "Aprovações", description: "Pedidos e decisões de aprovação nos seus projetos" },
  { type: "cliente", label: "Respostas do cliente", description: "Quando o cliente aprova ou pede ajustes pelo link enviado" },
  { type: "etapa", label: "Mudança de etapa", description: "Quando um projeto seu muda de etapa" },
  { type: "projeto", label: "Situação do projeto", description: "Pausa, retomada, conclusão ou cancelamento de um projeto seu, e arquivos enviados por freelancers" },
  { type: "comentario", label: "Comentários", description: "Comentários no seu projeto ou na sua tarefa, mesmo sem menção" },
  { type: "revisao", label: "Revisão de tarefas", description: "Quando uma tarefa do seu projeto ou pedida por você vai para revisão" },
  { type: "nf_solicitada", label: "Pedido de nota fiscal", description: "Quando uma NF é solicitada" },
  { type: "nf_recebida", label: "Nota fiscal recebida", description: "Quando um freelancer de um projeto seu envia a NF" },
  { type: "cadastro", label: "Dados de pagamento de freelancers", description: "Quando um freelancer muda PIX, banco ou documento (Financeiro)" },
  { type: "vencimento", label: "Vencimentos financeiros", description: "Recebíveis vencidos ou a vencer e NFs de freelancer pendentes, nos projetos que você acompanha" },
  { type: "seguranca", label: "Segurança da conta", description: "Seu perfil mudou, conta bloqueada por tentativas, convite aceito" },
  { type: "pagamento", label: "Seus pagamentos", description: "Quando sua NF é aprovada, fica divergente, é paga ou o pagamento é estornado" },
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
