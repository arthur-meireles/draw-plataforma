"use client";
import { ImportWizard } from "@/components/features/financeiro/import-wizard";
import { PageBody, PageHeader } from "@/components/ui";

export default function ImportPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Financeiro", icon: "finance", href: "/financeiro/visao-geral" }, { label: "Importar", icon: "upload" }]} />
      <PageBody width="content">
        <ImportWizard />
      </PageBody>
    </>
  );
}
