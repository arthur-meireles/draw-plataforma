import { ListPageSkeleton } from "@/components/ui";

/** Carregamento do segmento (troca de rota enquanto o bundle chega): estrutura de listagem, nunca tela em branco. */
export default function AppLoading() {
  return <ListPageSkeleton />;
}
