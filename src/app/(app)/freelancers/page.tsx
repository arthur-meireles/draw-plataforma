"use client";
import { Suspense } from "react";
import { FreelancersScreen } from "@/components/features/freelancers/freelancers-screen";
import { PageBody, PageHeader, Skeleton } from "@/components/ui";

export default function FreelancersPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Freelancers", icon: "freelancers" }]} />
          <PageBody>
            <Skeleton className="h-24" />
          </PageBody>
        </>
      }
    >
      <FreelancersScreen />
    </Suspense>
  );
}
