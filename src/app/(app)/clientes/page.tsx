"use client";
import { Suspense } from "react";
import { ClientsScreen } from "@/components/features/clientes/clients-screen";
import { ListPageSkeleton, PageHeader } from "@/components/ui";

export default function ClientesPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Clientes", icon: "clients" }]} />
          <ListPageSkeleton header={false} />
        </>
      }
    >
      <ClientsScreen />
    </Suspense>
  );
}
