"use client";
import { Suspense } from "react";
import { PayablesView } from "@/components/features/financeiro/payables-view";
import { ListPageSkeleton } from "@/components/ui";

export default function PayablesPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <PayablesView />
    </Suspense>
  );
}
