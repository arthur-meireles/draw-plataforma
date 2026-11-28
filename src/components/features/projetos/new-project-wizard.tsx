"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Button, EmptyState, PageBody, PageHeader, Reveal, Stepper, useSuccessFlash } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useClientOptions } from "@/data/hooks";
import { projectsApi } from "@/data/services";
import type { ApiError } from "@/data/services";
import { ProjectDataStep } from "./project-data-step";
import { ProjectFinancialStep } from "./project-financial-step";
import { ProjectOriginStep } from "./project-origin-step";
import { ProjectReviewStep } from "./project-review-step";
import { directPayload, initialWizardState, installmentsForCondition, quotePayload, stepOfField, stepsFor, validateStep, type FieldErrors, type ProjectOrigin, type WizardState, type WizardStepKey } from "./project-wizard-model";

/** Move o foco para o primeiro campo com erro (campos marcados com data-field). */
function focusFirstError(errors: FieldErrors, root: HTMLElement | null) {
  if (!root) return;
  requestAnimationFrame(() => {
    for (const key of Object.keys(errors)) {
      const el = root.querySelector<HTMLElement>(`[data-field="${key}"]`);
      const target = el?.matches("input,button,textarea,select") ? el : el?.querySelector<HTMLElement>("input,button,textarea,select");
      if (target) {
        target.focus();
        target.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
    }
  });
}

/** Assistente /projetos/novo: origem → dados → (valores e equipe) → revisão (RF-M3-02, RF-M4-01, RN-02). */
export function NewProjectWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { canWriteAll, user } = usePermissions();
  const canQuote = canWriteAll("commercial");
  const canDirect = canWriteAll("projects");
  const requested = params.get("origem");
  const initialOrigin: ProjectOrigin = requested === "cotacao" && canQuote ? "cotacao" : requested === "direto" && canDirect ? "direto" : canDirect ? "direto" : "cotacao";
  const [state, setState] = useState<WizardState>(() => initialWizardState(initialOrigin, params.get("cliente"), user.role === "freelancer" ? null : user.id));
  // Com ?origem= válida, a escolha já está feita: começa nos dados.
  const [index, setIndex] = useState(requested === "cotacao" || requested === "direto" ? 1 : 0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  const clients = useClientOptions();
  const termDays = clients.data?.find((c) => c.id === state.clientId)?.paymentTermDays ?? 0;
  const steps = stepsFor(state.origin);
  const step: WizardStepKey = steps[Math.min(index, steps.length - 1)].key;
  const last = index === steps.length - 1;

  const patch = (p: Partial<WizardState>) => {
    setState((s) => {
      const next = { ...s, ...p };
      // Parcela única ainda não editada acompanha o valor contratado.
      if (p.contractedCents !== undefined && s.installments.length === 1 && (s.installments[0].amountCents === 0 || s.installments[0].amountCents === s.contractedCents)) {
        next.installments = [{ ...s.installments[0], amountCents: p.contractedCents }];
      }
      // Condição pronta (à vista, 50/50) mantém as parcelas em sincronia com o valor contratado.
      const touchesPlan = p.contractedCents !== undefined || p.paymentCondition !== undefined || (p.dueAt !== undefined && next.paymentCondition === "50_50");
      if (touchesPlan && next.paymentCondition && next.paymentCondition !== "parcelado") next.installments = installmentsForCondition(next.paymentCondition, next.contractedCents, next.dueAt, s.installments, termDays);
      return next;
    });
    if (Object.keys(errors).length) setErrors({});
  };

  const created = useSuccessFlash(2000);
  const create = useApiMutation((s: WizardState) => (s.origin === "direto" ? projectsApi.createDirect(directPayload(s)) : projectsApi.createQuote(quotePayload(s))), {
    success: (p) => (p.origin === "direto" ? `Projeto ${p.code} criado e ativo.` : `Cotação ${p.code} criada no Comercial.`),
    onSuccess: (p) => created.flash(() => router.push(`/projetos/${p.code}`), 550),
    onError: (err: ApiError) => {
      if (!err.fieldErrors) return;
      setErrors(err.fieldErrors);
      const first = Object.keys(err.fieldErrors)[0];
      const target = steps.findIndex((s) => s.key === stepOfField(first));
      if (target >= 0) setIndex(target);
      focusFirstError(err.fieldErrors, bodyRef.current);
    },
  });

  const go = (to: number) => {
    setErrors({});
    setIndex(to);
    bodyRef.current?.scrollTo?.({ top: 0 });
  };

  const next = () => {
    const found = validateStep(step, state);
    if (Object.keys(found).length) {
      setErrors(found);
      focusFirstError(found, bodyRef.current);
      return;
    }
    if (last) {
      // Revalida tudo antes de enviar.
      for (const st of steps) {
        const e = validateStep(st.key, state);
        if (Object.keys(e).length) {
          setIndex(steps.findIndex((x) => x.key === st.key));
          setErrors(e);
          focusFirstError(e, bodyRef.current);
          return;
        }
      }
      create.mutate(state);
      return;
    }
    go(index + 1);
  };

  const onOrigin = (origin: ProjectOrigin) => setState((s) => ({ ...s, origin }));

  if (!canQuote && !canDirect)
    return (
      <>
        <PageHeader crumbs={[{ label: "Projetos", icon: "project", href: "/projetos" }, { label: "Novo projeto" }]} />
        <EmptyState icon="lock" title="Você não pode criar projetos" description="Peça a um administrador ou ao gestor para criar o projeto ou ajustar seu perfil." action={{ label: "Voltar aos projetos", href: "/projetos" }} />
      </>
    );

  return (
    <>
      <PageHeader crumbs={[{ label: "Projetos", icon: "project", href: "/projetos" }, { label: "Novo projeto" }]} />
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">
        <PageBody width="narrow" className="flex-1">
          <Stepper steps={steps} current={index} onSelect={go} className="mb-6" />
          <h2 className="mb-4 text-md font-semibold text-fg">{steps[index].label === "Revisão" ? "Confira antes de criar" : steps[index].label}</h2>
          <Reveal key={step}>
            {step === "origem" && <ProjectOriginStep value={state.origin} onChange={onOrigin} canQuote={canQuote} canDirect={canDirect} />}
            {step === "dados" && <ProjectDataStep state={state} patch={patch} errors={errors} />}
            {step === "financeiro" && <ProjectFinancialStep state={state} patch={patch} errors={errors} />}
            {step === "revisao" && <ProjectReviewStep state={state} />}
          </Reveal>
        </PageBody>
        <footer className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface px-3 py-3 max-md:pb-[calc(0.75rem+var(--spacing-bottomnav)+env(safe-area-inset-bottom))] md:px-6">
          <Button variant="ghost" onClick={() => (index === 0 ? router.push("/projetos") : go(index - 1))} icon={index === 0 ? undefined : "arrowLeft"} disabled={create.isPending}>
            {index === 0 ? "Cancelar" : "Voltar"}
          </Button>
          <Button variant="primary" onClick={next} loading={create.isPending} success={created.success} successLabel={state.origin === "direto" ? "Projeto criado" : "Cotação criada"} iconRight={last ? undefined : "arrowRight"} icon={last ? "check" : undefined}>
            {last ? (state.origin === "direto" ? "Criar projeto" : "Criar cotação") : "Continuar"}
          </Button>
        </footer>
      </div>
    </>
  );
}
