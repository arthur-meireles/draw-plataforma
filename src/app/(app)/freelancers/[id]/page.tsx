"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { FreelancerDetailScreen } from "@/components/features/freelancers/freelancer-detail-screen";
import { PageBody, PageHeader, Skeleton } from "@/components/ui";

export default function FreelancerDetalhePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Freelancers", href: "/freelancers", icon: "freelancers" }, { label: "Carregando…" }]} />
          <PageBody>
            <Skeleton className="h-24" />
          </PageBody>
        </>
      }
    >
      <FreelancerDetailScreen id={id} />
    </Suspense>
  );
}
