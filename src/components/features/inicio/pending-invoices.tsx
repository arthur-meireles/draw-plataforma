"use client";
/** Solicitações de nota fiscal pendentes do freelancer (RF-M9-05). */
import Link from "next/link";
import { Button, EmptyState, Icon, Section, Skeleton } from "@/components/ui";

export interface PendingInvoice {
  id: string;
  description: string;
  token: string | null;
}

export function PendingInvoices({ items, loading }: { items: PendingInvoice[] | undefined; loading?: boolean }) {
  return (
    <Section title="Notas fiscais pendentes" icon="invoice" description="Envie a NF para liberar o pagamento." bodyClassName="p-0">
      {loading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : !items?.length ? (
        <EmptyState compact icon="success" title="Nenhuma nota pendente" description="Quando um projeto for concluído, o pedido de NF aparece aqui." />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warning-subtle text-warning">
                <Icon name="invoice" size="sm" />
              </span>
              <span className="min-w-0 flex-1 text-sm text-fg">{i.description}</span>
              {i.token ? (
                <Button asChild variant="primary" size="sm">
                  <Link href={`/nf/${i.token}`}>Enviar nota fiscal</Link>
                </Button>
              ) : (
                <span className="text-xs text-fg-subtle">Link em preparação — fale com o financeiro</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
