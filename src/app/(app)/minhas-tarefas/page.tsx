"use client";
import { Suspense } from "react";
import { MyTasksView } from "@/components/features/inicio/my-tasks-view";

export default function MinhasTarefasPage() {
  return (
    <Suspense>
      <MyTasksView />
    </Suspense>
  );
}
