"use client";
import { Suspense } from "react";
import { BoardPageSkeleton } from "@/components/ui";
import { ActiveProjectsScreen } from "@/components/features/projetos";

export default function ProjetosPage() {
  return (
    <Suspense fallback={<BoardPageSkeleton />}>
      <ActiveProjectsScreen />
    </Suspense>
  );
}
