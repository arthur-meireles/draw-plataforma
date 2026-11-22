"use client";
import { Suspense } from "react";
import { ReceivablesView } from "@/components/features/financeiro/receivables-view";
import { Skeleton } from "@/components/ui";

export default function ReceivablesPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-64" />}>
      <ReceivablesView />
    </Suspense>
  );
}
