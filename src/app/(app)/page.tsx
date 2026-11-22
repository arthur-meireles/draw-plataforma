"use client";
import { Suspense } from "react";
import { HomeView } from "@/components/features/inicio/home-view";

export default function Home() {
  return (
    <Suspense>
      <HomeView />
    </Suspense>
  );
}
