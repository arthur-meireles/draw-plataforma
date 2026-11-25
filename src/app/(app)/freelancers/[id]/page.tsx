"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { FreelancerDetailScreen } from "@/components/features/freelancers/freelancer-detail-screen";
import { DetailPageSkeleton, PageHeader } from "@/components/ui";

export default function FreelancerDetalhePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Freelancers", href: "/freelancers", icon: "freelancers" }, { label: "Carregando…" }]} />
          <DetailPageSkeleton header={false} />
        </>
      }
    >
      <FreelancerDetailScreen id={id} />
    </Suspense>
  );
}
