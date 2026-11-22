"use client";
import { Suspense } from "react";
import { PayablesView } from "@/components/features/financeiro/payables-view";
import { Skeleton } from "@/components/ui";

export default function PayablesPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-64" />}>
      <PayablesView />
    </Suspense>
  );
}
