import Link from "next/link";
import { AuthLayout, AuthHeading } from "@/components/layout/auth-layout";

export const metadata = { title: "Sem conexão" };

/** Página amigável servida pelo service worker quando não há rede (10.6). */
export default function OfflinePage() {
  return (
    <AuthLayout>
      <AuthHeading title="Você está sem conexão" description="Assim que a internet voltar, a página recarrega normalmente. Enquanto isso, as telas já abertas continuam disponíveis só para leitura." />
      <Link href="/" className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent-solid text-sm font-medium text-accent-fg hover:bg-accent-solid-hover">
        Tentar novamente
      </Link>
    </AuthLayout>
  );
}
