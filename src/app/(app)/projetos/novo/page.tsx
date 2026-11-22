"use client";
import { Suspense } from "react";
import { NewProjectWizard } from "@/components/features/projetos";

export default function NovoProjetoPage() {
  return (
    <Suspense>
      <NewProjectWizard />
    </Suspense>
  );
}
