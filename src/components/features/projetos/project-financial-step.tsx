"use client";
import { MoneyField, Section } from "@/components/ui";
import { InstallmentsEditor, TeamEditor } from "@/components/domain";
import type { FieldErrors, WizardState } from "./project-wizard-model";

/** Etapa 3 (só projeto direto) — valor contratado, parcelas (RN-02) e equipe. */
export function ProjectFinancialStep({ state, patch, errors }: { state: WizardState; patch: (p: Partial<WizardState>) => void; errors: FieldErrors }) {
  return (
    <div className="space-y-6">
      <Section title="Valor contratado" description="Total fechado com o cliente. As parcelas abaixo precisam somar exatamente este valor.">
        <div data-field="contractedAmountCents" className="max-w-xs">
          <MoneyField label="Valor contratado" required value={state.contractedCents} onChange={(contractedCents) => patch({ contractedCents })} error={errors.contractedAmountCents} />
        </div>
      </Section>
      <Section title="Parcelas a receber" description="Cada parcela vira um recebível previsto, pronto para faturar.">
        <InstallmentsEditor value={state.installments} onChange={(installments) => patch({ installments })} contractedCents={state.contractedCents} error={errors.installments} errors={errors} />
      </Section>
      <Section title="Equipe" description="O responsável já entra automaticamente. Freelancers precisam de valor combinado.">
        <TeamEditor value={state.team} onChange={(team) => patch({ team })} errors={errors} />
      </Section>
    </div>
  );
}
