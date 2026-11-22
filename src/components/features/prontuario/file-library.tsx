"use client";
import { PageBody, PageHeader } from "@/components/ui";
import { FileManager } from "@/components/domain";

/** Biblioteca global de arquivos (RF-M7-03): todos os projetos visíveis, agrupados por projeto. */
export function FileLibrary() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Arquivos", icon: "files" }]} />
      <PageBody padded={false}>
        <FileManager library />
      </PageBody>
    </>
  );
}
