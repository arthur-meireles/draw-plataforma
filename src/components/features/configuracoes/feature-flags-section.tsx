"use client";
import { Badge, Section, Skeleton } from "@/components/ui";
import { useOrganization } from "@/data/hooks";

const FLAG: Record<string, { label: string; description: string }> = {
  portal_cliente: { label: "Portal do cliente", description: "Acesso do cliente aos próprios projetos (futuro)" },
  ambientes_juridicos: { label: "Ambientes jurídicos", description: "Conteúdo sob medida para escritórios (futuro)" },
  email_usuario: { label: "E-mail do usuário", description: "Enviar e-mails do projeto pela caixa de cada pessoa" },
  login_google: { label: "Login com Google", description: "Entrar com a conta Google, além de e-mail e senha" },
};

/** Recursos liberados por configuração do sistema — somente leitura (P13). */
export function FeatureFlagsSection() {
  const org = useOrganization();
  return (
    <Section title="Recursos do sistema" description="Liberados pela equipe técnica; não podem ser alterados aqui" icon="sparkle">
      {org.isLoading ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="divide-y divide-line">
          {org.data?.flags.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">{FLAG[f.key]?.label ?? f.key}</p>
                {FLAG[f.key] && <p className="text-xs text-fg-subtle">{FLAG[f.key].description}</p>}
              </div>
              <Badge tone={f.enabled ? "success" : "neutral"} dot>
                {f.enabled ? "Ligado" : "Desligado"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
