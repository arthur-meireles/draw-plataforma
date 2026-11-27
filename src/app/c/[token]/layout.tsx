import type { Metadata } from "next";
import "../../motion.css";

export const metadata: Metadata = {
  title: "Material da Draw",
  robots: { index: false, follow: false },
};

/** Página pública do cliente (RN-51/52) — sem sessão, mesma moldura do formulário de NF. */
export default function PublicClientLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
