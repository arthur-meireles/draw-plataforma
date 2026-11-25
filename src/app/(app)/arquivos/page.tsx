"use client";
import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui";
import { DriveView } from "@/components/features/drive/drive-view";

export default function FilesPage() {
  return (
    <Suspense fallback={<ListPageSkeleton />}>
      <DriveView />
    </Suspense>
  );
}
