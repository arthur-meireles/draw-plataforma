"use client";
import { DescriptionList, Section } from "@/components/ui";
import { Money, PriorityPill, usePeopleOptions } from "@/components/domain";
import { MEMBER_ROLE_LABEL } from "@/data/reference";
import { useClientOptions, useProjectTypes } from "@/data/hooks";
import { dateFull, fromDateInput } from "@/lib/format";
import type { WizardState } from "./project-wizard-model";

/** Etapa final — confira tudo antes de criar. */
export function ProjectReviewStep({ state }: { state: WizardState }) {
  const clients = useClientOptions();
  const types = useProjectTypes();
  const people = usePeopleOptions();
  const client = clients.data?.find((c) => c.id === state.clientId);
  const type = types.data?.find((t) => t.id === state.projectTypeId);
  const direct = state.origin === "direto";
  return (
    <div className="space-y-6">
      <Section title="Projeto">
        <DescriptionList
          items={[
            { label: "Origem", value: direct ? "Projeto direto — já aprovado" : "Cotação — nasce no Comercial" },
            { label: "Cliente", value: client?.tradeName },
            { label: "Tipo", value: type ? `${type.name} (${type.codePrefix}-NNN)` : "—" },
            { label: "Título", value: state.title },
            { label: "Responsável", value: people.find(state.owner)?.name },
            { label: "Prioridade", value: <PriorityPill value={state.priority} /> },
            { label: "Prazo", value: state.dueAt ? dateFull(fromDateInput(state.dueAt)) : "Sem prazo" },
            { label: "Briefing", value: state.briefing || "Sem briefing" },
          ]}
        />
      </Section>
      {direct && (
        <>
          <Section title="Financeiro">
            <DescriptionList columns={1} items={[{ label: "Valor contratado", value: <Money cents={state.contractedCents} /> }]} />
            <ul className="mt-3 divide-y divide-line rounded-md border border-line text-sm">
              {state.installments.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate">{r.description}</span>
                  <span className="flex shrink-0 items-center gap-3 tabular-nums">
                    <span className="text-xs text-fg-subtle">{r.expectedAt ? dateFull(fromDateInput(r.expectedAt)) : "—"}</span>
                    <Money cents={r.amountCents} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Equipe">
            <ul className="divide-y divide-line rounded-md border border-line text-sm">
              <li className="flex items-center justify-between px-3 py-2">
                <span>{people.find(state.owner)?.name ?? "—"}</span>
                <span className="text-xs text-fg-subtle">{MEMBER_ROLE_LABEL.responsavel}</span>
              </li>
              {state.team.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>{people.find(r.person)?.name ?? "—"}</span>
                  <span className="flex items-center gap-3 text-xs text-fg-subtle">
                    {MEMBER_ROLE_LABEL[r.role]}
                    {r.person?.kind === "freelancer" && <Money cents={r.agreedAmountCents} />}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

