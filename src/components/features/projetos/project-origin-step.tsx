"use client";
import { RadioGroup, type Option } from "@/components/ui";
import type { ProjectOrigin } from "./project-wizard-model";

/** Etapa 1 — de onde nasce o projeto (RF-M3-02 / RF-M4-01). */
export function ProjectOriginStep({ value, onChange, canQuote, canDirect }: { value: ProjectOrigin; onChange: (o: ProjectOrigin) => void; canQuote: boolean; canDirect: boolean }) {
  const options: Option<ProjectOrigin>[] = [
    {
      value: "cotacao",
      label: "Cotação — nasce no Comercial",
      description: canQuote ? "O projeto entra no funil comercial, recebe proposta e só vira projeto ativo depois da aprovação do cliente." : "Seu perfil não cria cotações.",
      icon: "commercial",
      disabled: !canQuote,
    },
    {
      value: "direto",
      label: "Projeto direto — já aprovado",
      description: canDirect ? "Para trabalho já fechado: informe valor contratado, parcelas e equipe. O projeto nasce ativo na etapa Roteiro." : "Seu perfil não cria projetos diretos.",
      icon: "project",
      disabled: !canDirect,
    },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">Escolha como este projeto começa. Dá para voltar e mudar antes de criar.</p>
      <RadioGroup value={value} onChange={onChange} options={options} />
    </div>
  );
}
