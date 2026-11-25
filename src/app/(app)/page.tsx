"use client";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/ui";
import { HomeView } from "@/components/features/inicio/home-view";

export default function Home() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <HomeView />
    </Suspense>
  );
}
