"use client";
import { Suspense } from "react";
import { DriveView } from "@/components/features/drive/drive-view";

export default function FilesPage() {
  return (
    <Suspense fallback={null}>
      <DriveView />
    </Suspense>
  );
}
