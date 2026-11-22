"use client";
import { Suspense } from "react";
import { CompletedProjectsScreen } from "@/components/features/projetos";

export default function ProjetosConcluidosPage() {
  return (
    <Suspense>
      <CompletedProjectsScreen />
    </Suspense>
  );
}
