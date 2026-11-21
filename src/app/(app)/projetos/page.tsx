"use client";
import { Suspense } from "react";
import { ActiveProjectsScreen } from "@/components/features/projetos";

export default function ProjetosPage() {
  return (
    <Suspense>
      <ActiveProjectsScreen />
    </Suspense>
  );
}
