"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ClientDetailScreen } from "@/components/features/clientes/client-detail-screen";
import { PageBody, PageHeader, Skeleton } from "@/components/ui";

export default function ClienteDetalhePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Clientes", href: "/clientes", icon: "clients" }, { label: "Carregando…" }]} />
          <PageBody>
            <Skeleton className="h-24" />
          </PageBody>
        </>
      }
    >
      <ClientDetailScreen id={id} />
    </Suspense>
  );
}
