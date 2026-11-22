"use client";
/** Linha da caixa de entrada: ícone do tipo, título, trecho, projeto, tempo relativo e ponto de não lida. */
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { relative } from "@/lib/format";
import type { notificationsApi } from "@/data/services";
import { notificationMeta } from "./notification-meta";

export type InboxNotification = Awaited<ReturnType<typeof notificationsApi.list>>[number];

export function InboxItem({ item: n, selected, onSelect }: { item: InboxNotification; selected: boolean; onSelect: (n: InboxNotification) => void }) {
  const unread = !n.readAt;
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-current={selected || undefined}
        onClick={() => onSelect(n)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(n))}
        className={cn("relative flex min-h-16 cursor-pointer gap-3 border-b border-line px-4 py-3 outline-none transition-colors hover:bg-layer-hover/60 focus-visible:bg-layer-hover", selected && "bg-accent-subtle hover:bg-accent-subtle")}
      >
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", unread ? "bg-accent-subtle text-accent" : "bg-layer text-fg-subtle")}>
          <Icon name={notificationMeta[n.type].icon} size="sm" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-semibold text-fg" : "text-fg-muted")}>{n.title}</span>
            <time dateTime={n.createdAt} className="shrink-0 text-2xs text-fg-subtle">
              {relative(n.createdAt)}
            </time>
          </span>
          {n.body && <span className="mt-0.5 block truncate text-xs text-fg-subtle">{n.body}</span>}
          <span className="mt-1 flex items-center gap-2 text-2xs text-fg-subtle">
            <span>{notificationMeta[n.type].label}</span>
            {n.projectCode && <span className="font-mono">{n.projectCode}</span>}
          </span>
        </span>
        {unread && <span aria-label="Não lida" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />}
      </div>
    </li>
  );
}
