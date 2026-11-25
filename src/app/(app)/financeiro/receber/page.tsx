"use client";
import { Suspense } from "react";
import { ReceivablesView } from "@/components/features/financeiro/receivables-view";
import { ListPageSkeleton } from "@/components/ui";

export default function ReceivablesPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <ReceivablesView />
    </Suspense>
  );
}
