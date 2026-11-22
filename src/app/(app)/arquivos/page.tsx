"use client";
import { Suspense } from "react";
import { FileLibrary } from "@/components/features/prontuario/file-library";

export default function FilesPage() {
  return (
    <Suspense fallback={null}>
      <FileLibrary />
    </Suspense>
  );
}
