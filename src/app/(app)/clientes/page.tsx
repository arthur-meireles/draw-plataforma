"use client";
import { Suspense } from "react";
import { ClientsScreen } from "@/components/features/clientes/clients-screen";
import { PageBody, PageHeader, Skeleton } from "@/components/ui";

export default function ClientesPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Clientes", icon: "clients" }]} />
          <PageBody>
            <Skeleton className="h-24" />
          </PageBody>
        </>
      }
    >
      <ClientsScreen />
    </Suspense>
  );
}
