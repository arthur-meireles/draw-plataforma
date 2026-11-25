"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { DetailPageSkeleton, PageHeader } from "@/components/ui";
import { ProjectRecord } from "@/components/features/prontuario/project-record";

export default function ProjectPage() {
  const { code } = useParams<{ code: string }>();
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Projetos", href: "/projetos", icon: "projects" }, { label: String(code) }]} />
          <DetailPageSkeleton header={false} />
        </>
      }
    >
      <ProjectRecord code={decodeURIComponent(String(code))} />
    </Suspense>
  );
}
