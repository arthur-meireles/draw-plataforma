"use client";
import { Suspense } from "react";
import { CommercialScreen } from "@/components/features/comercial/commercial-screen";
import { BoardPageSkeleton, PageHeader } from "@/components/ui";

export default function ComercialPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Comercial", icon: "commercial" }]} />
          <BoardPageSkeleton header={false} />
        </>
      }
    >
      <CommercialScreen />
    </Suspense>
  );
}
