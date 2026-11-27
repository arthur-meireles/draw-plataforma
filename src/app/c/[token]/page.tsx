"use client";
import { useParams } from "next/navigation";
import { PublicClientLink } from "@/components/features/cliente/public-client-link";

export default function PublicClientLinkPage() {
  const { token } = useParams<{ token: string }>();
  return <PublicClientLink token={token} />;
}
