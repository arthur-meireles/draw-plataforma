"use client";
import { Suspense } from "react";
import { InboxView } from "@/components/features/caixa/inbox-view";

export default function CaixaDeEntradaPage() {
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
