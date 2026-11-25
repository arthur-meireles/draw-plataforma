"use client";
import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui";
import { MyTasksView } from "@/components/features/inicio/my-tasks-view";

export default function MinhasTarefasPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <MyTasksView />
    </Suspense>
  );
}
