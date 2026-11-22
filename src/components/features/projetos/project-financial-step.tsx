"use client";
import { Field, MoneyField, SegmentedControl, Section } from "@/components/ui";
import { PAYMENT_CONDITION_LABEL } from "@/data/reference";
import type { PaymentCondition } from "@/data/types";
import { InstallmentsEditor, TeamEditor } from "@/components/domain";
import type { FieldErrors, WizardState } from "./project-wizard-model";

/** Etapa 3 (só projeto direto) — valor contratado, parcelas (RN-02) e equipe. */
const CONDITIONS = (Object.keys(PAYMENT_CONDITION_LABEL) as PaymentCondition[]).map((k) => ({ value: k, label: PAYMENT_CONDITION_LABEL[k] }));
const CONDITION_HINT: Record<PaymentCondition, string> = {
  a_vista: "1 parcela, com vencimento hoje.",
  "50_50": "2 parcelas: 50% na aprovação e 50% na entrega (usa o prazo do projeto, se houver).",
  parcelado: "Monte as parcelas manualmente abaixo.",
};

export function ProjectFinancialStep({ state, patch, errors }: { state: WizardState; patch: (p: Partial<WizardState>) => void; errors: FieldErrors }) {
  return (
    <div className="space-y-6">
      <Section title="Valor contratado" description="Total fechado com o cliente. As parcelas abaixo precisam somar exatamente este valor.">
        <div data-field="contractedAmountCents" className="max-w-xs">
          <MoneyField label="Valor contratado" required value={state.contractedCents} onChange={(contractedCents) => patch({ contractedCents })} error={errors.contractedAmountCents} />
        </div>
      </Section>
      <Section title="Parcelas a receber" description="Cada parcela vira um recebível previsto, pronto para faturar.">
        <Field label="Condição de pagamento" hint={state.paymentCondition ? CONDITION_HINT[state.paymentCondition] : "Escolha uma condição pronta para preencher as parcelas, ou monte à mão."} className="mb-4">
          {() => <SegmentedControl aria-label="Condição de pagamento" value={state.paymentCondition ?? ("" as PaymentCondition)} onChange={(paymentCondition) => patch({ paymentCondition })} options={CONDITIONS} />}
        </Field>
        <InstallmentsEditor value={state.installments} onChange={(installments) => patch({ installments, paymentCondition: "parcelado" })} contractedCents={state.contractedCents} error={errors.installments} errors={errors} />
      </Section>
      <Section title="Equipe" description="O responsável já entra automaticamente. Freelancers precisam de valor combinado.">
        <TeamEditor value={state.team} onChange={(team) => patch({ team })} errors={errors} />
      </Section>
    </div>
  );
}
