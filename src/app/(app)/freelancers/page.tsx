"use client";
import { Suspense } from "react";
import { FreelancersScreen } from "@/components/features/freelancers/freelancers-screen";
import { ListPageSkeleton, PageHeader } from "@/components/ui";

export default function FreelancersPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader crumbs={[{ label: "Freelancers", icon: "freelancers" }]} />
          <ListPageSkeleton header={false} />
        </>
      }
    >
      <FreelancersScreen />
    </Suspense>
  );
}
