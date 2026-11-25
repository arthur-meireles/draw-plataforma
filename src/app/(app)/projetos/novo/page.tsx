"use client";
import { Suspense } from "react";
import { FormPageSkeleton } from "@/components/ui";
import { NewProjectWizard } from "@/components/features/projetos";

export default function NovoProjetoPage() {
  return (
    <Suspense fallback={<FormPageSkeleton />}>
      <NewProjectWizard />
    </Suspense>
  );
}
