"use client";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/ui";
import { PainelView } from "@/components/features/painel/painel-view";

export default function PainelPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <PainelView />
    </Suspense>
  );
}
