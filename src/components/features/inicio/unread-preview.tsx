"use client";
/** Prévia das notificações não lidas no Início. */
import Link from "next/link";
import { Badge, EmptyState, Icon, Section, Skeleton } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { notificationsApi } from "@/data/services";
import { relative } from "@/lib/format";
import { notificationMeta } from "@/components/features/caixa/notification-meta";

export function UnreadPreview() {
  const q = useApiQuery(["notifications", "unread-list"], () => notificationsApi.list({ unread: true }));
  const items = q.data ?? [];
  return (
    <Section title="Não lidas" icon="inbox" bodyClassName="p-0" actions={<Link href="/caixa-de-entrada" className="text-xs text-accent hover:underline">Abrir caixa de entrada</Link>}>
      {q.isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
        </div>
      ) : !items.length ? (
        <EmptyState compact icon="success" title="Você está em dia" description="Nenhuma notificação pendente." />
      ) : (
        <ul className="divide-y divide-line">
          {items.slice(0, 5).map((n) => (
            <li key={n.id}>
              <Link href={`/caixa-de-entrada?n=${n.id}`} className="flex min-h-11 items-start gap-3 px-4 py-2.5 hover:bg-layer-hover/60">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-layer text-fg-muted"><Icon name={notificationMeta[n.type].icon} size="sm" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{n.title}</span>
                  <span className="flex items-center gap-2 text-xs text-fg-subtle">
                    {n.projectCode && <span className="font-mono">{n.projectCode}</span>}
                    {relative(n.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {items.length > 5 && <li className="px-4 py-2 text-xs text-fg-subtle"><Badge size="xs">+{items.length - 5}</Badge> outras não lidas</li>}
        </ul>
      )}
    </Section>
  );
}
