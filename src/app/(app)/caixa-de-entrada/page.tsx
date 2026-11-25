"use client";
import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/ui";
import { InboxView } from "@/components/features/caixa/inbox-view";

export default function CaixaDeEntradaPage() {
  return (
    <Suspense fallback={<ListPageSkeleton chips={2} />}>
      <InboxView />
    </Suspense>
  );
}
