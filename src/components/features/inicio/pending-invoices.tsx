"use client";
/** Solicitações de nota fiscal pendentes do freelancer (RF-M9-05). */
import Link from "next/link";
import { Badge, Button, EmptyState, Icon, Section, Skeleton } from "@/components/ui";
import { dateFull } from "@/lib/format";

export interface PendingInvoice {
  id: string;
  description: string;
  token: string | null;
  status?: "aguardando_nf" | "divergente";
  divergenceNote?: string | null;
  /** Pagamento previsto (RN-06). */
  dueAt?: string | null;
}

export function PendingInvoices({ items, loading }: { items: PendingInvoice[] | undefined; loading?: boolean }) {
  return (
    <Section title="Notas fiscais pendentes" icon="invoice" description="Envie a NF para liberar o pagamento. Se o Financeiro apontar uma divergência, o motivo aparece aqui." bodyClassName="p-0">
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
              <span className="min-w-0 flex-1 text-sm text-fg">
                {i.description}
                {i.dueAt && <span className="block text-xs text-fg-subtle">Pagamento previsto em {dateFull(i.dueAt)}</span>}
                {i.status === "divergente" && <span className="mt-1 block text-xs text-warning">Divergência: {i.divergenceNote ?? "confira com o Financeiro"}</span>}
              </span>
              {i.status === "divergente" ? (
                <Badge tone="warning" dot>
                  O Financeiro vai pedir uma nova NF
                </Badge>
              ) : i.token ? (
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
