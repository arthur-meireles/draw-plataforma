import type { Metadata } from "next";
import "../../motion.css";

export const metadata: Metadata = {
  title: "Enviar nota fiscal",
  robots: { index: false, follow: false },
};

export default function PublicInvoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
