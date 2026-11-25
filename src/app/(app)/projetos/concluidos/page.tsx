"use client";
import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui";
import { CompletedProjectsScreen } from "@/components/features/projetos";

export default function ProjetosConcluidosPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <CompletedProjectsScreen />
    </Suspense>
  );
}
