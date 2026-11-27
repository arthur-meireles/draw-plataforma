/**
 * Modo de demonstração — mesma regra dos atalhos do login: ligado fora de produção ou com
 * `NEXT_PUBLIC_DEMO_LOGIN=1`. Controla "Trocar perfil" e "Restaurar dados de demonstração"
 * (RN-33), que o serviço também recusa quando desligado. Lido a cada chamada (testes alternam).
 */
export function isDemoMode(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_LOGIN === "1";
}
