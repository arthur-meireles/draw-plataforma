import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enviar nota fiscal",
  robots: { index: false, follow: false },
};

export default function PublicInvoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
