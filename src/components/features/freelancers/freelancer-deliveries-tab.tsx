"use client";
/** Aba "Entregas": arquivos de entrega enviados pelo freelancer (RF-M2-04). */
import { Badge, DataTable, Icon, type Column } from "@/components/ui";
import { dateTime, fileSize } from "@/lib/format";
import type { FreelancerDetail } from "./use-freelancers";

type Row = FreelancerDetail["deliveries"][number];

export function FreelancerDeliveriesTab({ freelancer: f }: { freelancer: FreelancerDetail }) {
  const columns: Column<Row>[] = [
    {
      id: "file",
      header: "Arquivo",
      mobile: "title",
      sortValue: (d) => d.fileName,
      cell: (d) => (
        <span className="flex min-w-0 items-center gap-2">
          <Icon name="delivery" size="sm" className="shrink-0 text-fg-subtle" />
          <span className="truncate font-medium text-fg">{d.fileName}</span>
        </span>
      ),
    },
    { id: "version", header: "Versão", mobile: "meta", sortValue: (d) => d.version, cell: (d) => <Badge>v{d.version}</Badge> },
    { id: "size", header: "Tamanho", hideBelow: "md", mobile: "meta", sortValue: (d) => d.size, cell: (d) => <span className="text-fg-muted">{fileSize(d.size)}</span> },
    { id: "note", header: "Nota", hideBelow: "lg", mobile: "hidden", cell: (d) => <span className="block max-w-72 truncate text-fg-muted">{d.note ?? "—"}</span> },
    { id: "at", header: "Enviado em", mobile: "meta", sortValue: (d) => d.createdAt, cell: (d) => <span className="text-fg-muted">{dateTime(d.createdAt)}</span> },
  ];
  return (
    <DataTable
      rows={f.deliveries}
      columns={columns}
      getRowId={(d) => d.id}
      initialSort={{ id: "at", dir: "desc" }}
      empty={{ icon: "delivery", title: "Nenhuma entrega enviada", description: "Os arquivos de entrega enviados por este freelancer ficam registrados aqui, com versão e data." }}
    />
  );
}
