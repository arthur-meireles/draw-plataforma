"use client";
import { Suspense } from "react";
import { PainelView } from "@/components/features/painel/painel-view";

export default function PainelPage() {
  return (
    <Suspense>
      <PainelView />
    </Suspense>
  );
}
