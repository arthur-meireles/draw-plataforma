"use client";
import { useParams } from "next/navigation";
import { PublicInvoiceForm } from "@/components/features/financeiro/public-invoice-form";

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  return <PublicInvoiceForm token={token} />;
}
