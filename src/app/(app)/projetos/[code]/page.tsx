"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { PageBody, PageHeader, Skeleton } from "@/components/ui";
import { ProjectRecord } from "@/components/features/prontuario/project-record";

export default function ProjectPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Projetos", href: "/projetos", icon: "projects" }, { label: String(code) }]} />
          <PageBody><Skeleton className="h-64" /></PageBody>
        </>
      }
    >
      <ProjectRecord code={decodeURIComponent(String(code))} />
    </Suspense>
  );
}
