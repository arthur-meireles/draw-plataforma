"use client";
import { Suspense } from "react";
import { CommercialScreen } from "@/components/features/comercial/commercial-screen";
import { PageBody, PageHeader, Skeleton } from "@/components/ui";

export default function ComercialPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Comercial", icon: "commercial" }]} />
          <PageBody>
            <Skeleton className="h-24" />
          </PageBody>
        </>
      }
    >
      <CommercialScreen />
    </Suspense>
  );
}
