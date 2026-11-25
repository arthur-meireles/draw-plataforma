"use client";
/** Cabeçalho da ficha do cliente (RF-M2-02): nome, CNPJ, segmento, status, grupo com links para as irmãs. */
import Link from "next/link";
import { Badge, Icon, Copyable } from "@/components/ui";
import { formatCnpj } from "@/lib/format";
import { ClientStatusBadge } from "./client-status-badge";
import type { ClientDetail } from "./use-clients";

export function ClientHeader({ client: c }: { client: ClientDetail }) {
  return (
    <div className="border-b border-line bg-surface px-4 py-4 md:px-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-layer text-fg-muted">
          <Icon name="client" size="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-fg">{c.tradeName}</p>
          <p className="truncate text-xs text-fg-subtle">{c.legalName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-subtle">
            <ClientStatusBadge status={c.status} />
            <Copyable value={c.cnpj} label="CNPJ" className="font-mono">{formatCnpj(c.cnpj)}</Copyable>
            <Badge icon="tag">{c.segment}</Badge>
            {c.group && (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <Icon name="clients" size="xs" />
                <span title="Grupo econômico">{c.group.name}</span>
                {c.siblings.length > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    {c.siblings.map((s, i) => (
                      <span key={s.id}>
                        <Link href={`/clientes/${s.id}`} className="rounded-sm text-accent hover:underline">
                          {s.tradeName}
                        </Link>
                        {i < c.siblings.length - 1 && ","}
                      </span>
                    ))}
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
