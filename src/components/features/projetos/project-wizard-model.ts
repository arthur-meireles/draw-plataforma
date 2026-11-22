/** Modelo do assistente "Novo projeto": estado, validação por etapa e montagem do payload (RF-M3-02, RF-M4-01, RN-02). */
import { emptyInstallment, type InstallmentRow, type PersonRef, type TeamRow } from "@/components/domain";
import { fromDateInput } from "@/lib/format";
import type { PaymentCondition, PriorityKey, ProjectSize } from "@/data/types";

export type ProjectOrigin = "cotacao" | "direto";
export type WizardStepKey = "origem" | "dados" | "financeiro" | "revisao";

export interface WizardState {
  origin: ProjectOrigin;
  clientId: string | null;
  projectTypeId: string | null;
  title: string;
  briefing: string;
  owner: PersonRef | null;
  priority: PriorityKey;
  /** yyyy-mm-dd */
  dueAt: string;
  contractedCents: number;
  installments: InstallmentRow[];
  team: TeamRow[];
  size: ProjectSize | null;
  /** Só projeto direto. "parcelado" = parcelas montadas à mão. */
  paymentCondition: PaymentCondition | null;
}

export const initialWizardState = (origin: ProjectOrigin, clientId: string | null, ownerId: string | null): WizardState => ({
  origin,
  clientId,
  projectTypeId: null,
  title: "",
  briefing: "",
  owner: ownerId ? { kind: "user", id: ownerId } : null,
  priority: "media",
  dueAt: "",
  contractedCents: 0,
  installments: [emptyInstallment()],
  team: [],
  size: null,
  paymentCondition: null,
});

const todayInput = (plusDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return d.toISOString().slice(0, 10);
};

/**
 * Parcelas das condições prontas: "À vista" (1 parcela) e "50/50" (na aprovação / na entrega).
 * Mantém chave e data de linhas já existentes para não perder o que a pessoa editou.
 */
export function installmentsForCondition(condition: PaymentCondition, totalCents: number, dueAt: string, current: InstallmentRow[]): InstallmentRow[] {
  if (condition === "parcelado") return current;
  const base =
    condition === "a_vista"
      ? [{ description: "Pagamento à vista", amountCents: totalCents, expectedAt: todayInput() }]
      : (() => {
          const half = Math.floor(totalCents / 2);
          return [
            { description: "50% na aprovação", amountCents: half, expectedAt: todayInput() },
            { description: "50% na entrega", amountCents: totalCents - half, expectedAt: dueAt || todayInput(30) },
          ];
        })();
  return base.map((row, i) => ({ ...emptyInstallment(i + 1), ...row, ...(current.length === base.length && current[i] ? { key: current[i].key, expectedAt: current[i].expectedAt || row.expectedAt } : {}) }));
}

export const stepsFor = (origin: ProjectOrigin): { key: WizardStepKey; label: string }[] =>
  origin === "direto"
    ? [
        { key: "origem", label: "Origem" },
        { key: "dados", label: "Dados do projeto" },
        { key: "financeiro", label: "Valores e equipe" },
        { key: "revisao", label: "Revisão" },
      ]
    : [
        { key: "origem", label: "Origem" },
        { key: "dados", label: "Dados do projeto" },
        { key: "revisao", label: "Revisão" },
      ];

export type FieldErrors = Record<string, string>;

/** Etapa em que cada campo (chave de erro da API) é editado. */
export const stepOfField = (field: string): WizardStepKey => (/^(contractedAmountCents|installments|team)/.test(field) ? "financeiro" : "dados");

export function validateStep(step: WizardStepKey, s: WizardState): FieldErrors {
  const e: FieldErrors = {};
  if (step === "dados") {
    if (!s.clientId) e.clientId = "Escolha o cliente ou cadastre um novo";
    if (!s.projectTypeId) e.projectTypeId = "Escolha o tipo de projeto";
    if (s.title.trim().length < 3) e.title = "Dê um título com ao menos 3 caracteres";
    if (!s.owner) e.ownerId = "Escolha quem será o responsável";
  }
  if (step === "financeiro") {
    if (s.contractedCents <= 0) e.contractedAmountCents = "Informe o valor contratado";
    s.installments.forEach((r, i) => {
      if (!r.description.trim()) e[`installments.${i}.description`] = "Descreva a parcela";
      if (r.amountCents <= 0) e[`installments.${i}.amountCents`] = "Informe o valor";
      if (!r.expectedAt) e[`installments.${i}.expectedAt`] = "Informe a data prevista";
    });
    const sum = s.installments.reduce((a, r) => a + r.amountCents, 0);
    if (s.contractedCents > 0 && sum !== s.contractedCents) e.installments = "A soma das parcelas deve ser igual ao valor contratado";
    s.team.forEach((r, i) => {
      if (!r.person) e[`team.${i}.person`] = "Escolha a pessoa ou remova a linha";
      else if (r.person.kind === "freelancer" && r.agreedAmountCents <= 0) e[`team.${i}.agreedAmountCents`] = "Informe o valor combinado com o freelancer";
    });
    const seen = new Set<string>();
    s.team.forEach((r, i) => {
      if (!r.person) return;
      const k = `${r.person.kind}:${r.person.id}`;
      if (seen.has(k)) e[`team.${i}.person`] = "Esta pessoa já está na equipe";
      seen.add(k);
    });
  }
  return e;
}

export const quotePayload = (s: WizardState) => ({
  clientId: s.clientId!,
  projectTypeId: s.projectTypeId!,
  title: s.title,
  ownerId: s.owner!.id,
  briefing: s.briefing || undefined,
  priorityKey: s.priority,
  dueAt: fromDateInput(s.dueAt),
  size: s.size,
});

export const directPayload = (s: WizardState) => ({
  ...quotePayload(s),
  paymentCondition: s.paymentCondition,
  contractedAmountCents: s.contractedCents,
  installments: s.installments.map((r) => ({ description: r.description.trim(), amountCents: r.amountCents, expectedAt: fromDateInput(r.expectedAt)! })),
  team: s.team
    .filter((r) => r.person)
    .map((r) => ({
      userId: r.person!.kind === "user" ? r.person!.id : null,
      freelancerId: r.person!.kind === "freelancer" ? r.person!.id : null,
      memberRole: r.role,
      agreedAmountCents: r.person!.kind === "freelancer" ? r.agreedAmountCents : null,
    })),
});

