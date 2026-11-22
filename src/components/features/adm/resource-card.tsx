"use client";
import { Button, Card, Icon, RowActions } from "@/components/ui";
import type { IconName } from "@/design/icons";
import type { Resource, ResourceCategory } from "@/data/types";

export const RESOURCE_ICON: Record<ResourceCategory, IconName> = { ferramenta: "tool", template: "file", playbook: "document", referencia: "link" };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Cartão de recurso da biblioteca (RF-M6-04). */
export function ResourceCard({ resource: r, onEdit, onDelete }: { resource: Resource; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <Card className="group flex flex-col gap-3 p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-layer text-fg-muted">
          <Icon name={RESOURCE_ICON[r.category]} size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{r.title}</p>
          <p className="truncate text-xs text-fg-subtle">{hostOf(r.url)}</p>
        </div>
        {(onEdit || onDelete) && (
          <RowActions
            label={`Ações de ${r.title}`}
            items={[
              { label: "Editar", icon: "edit", hidden: !onEdit, onSelect: onEdit },
              { label: "Excluir…", icon: "delete", destructive: true, hidden: !onDelete, separatorBefore: true, onSelect: onDelete },
            ]}
          />
        )}
      </div>
      {r.description && <p className="line-clamp-2 flex-1 text-sm text-fg-muted">{r.description}</p>}
      <div>
        <Button asChild size="sm" variant="outline">
          <a href={r.url} target="_blank" rel="noopener noreferrer">
            <Icon name="externalLink" size="sm" />
            Abrir link
          </a>
        </Button>
      </div>
    </Card>
  );
}
