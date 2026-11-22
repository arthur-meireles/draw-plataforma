"use client";
import { useEffect, useState } from "react";
import { usePermissions } from "@/components/layout/session";
import { Button, Section, Skeleton, TextField } from "@/components/ui";
import { useApiMutation, useOrganization } from "@/data/hooks";
import { usersApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";

/** Regras da organização: dia de pagamento de freelancers (RN-06) e dias de alerta de vencimento (RF-M4-13). */
export function OrgSettingsSection() {
  const p = usePermissions();
  const canEdit = p.canWriteAll("settings");
  const org = useOrganization();
  const [day, setDay] = useState("");
  const [soon, setSoon] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const settings = org.data?.org.settings;
  useEffect(() => {
    if (settings) {
      setDay(String(settings.freelancerPaymentDay));
      setSoon(String(settings.dueSoonDays));
    }
  }, [settings]);

  const save = useApiMutation(usersApi.updateOrganization, {
    success: "Regras da organização salvas",
    onSuccess: () => setErrors({}),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const d = Number(day);
    const s = Number(soon);
    if (!Number.isInteger(d) || d < 1 || d > 28) errs.freelancerPaymentDay = "Escolha um dia entre 1 e 28";
    if (!Number.isInteger(s) || s < 1 || s > 30) errs.dueSoonDays = "Use de 1 a 30 dias";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    save.mutate({ freelancerPaymentDay: d, dueSoonDays: s });
  };

  return (
    <Section title="Regras da organização" description={canEdit ? "Valem para todos os usuários" : "Somente administradores alteram estas regras"} icon="settings">
      {org.isLoading ? (
        <Skeleton className="h-24" />
      ) : (
        <form onSubmit={submit} noValidate>
          <fieldset disabled={!canEdit || save.isPending} className="grid gap-4 sm:grid-cols-2">
            <TextField label="Dia de pagamento dos freelancers" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} error={errors.freelancerPaymentDay} hint="Entre 1 e 28, para valer em todos os meses (RN-06)." />
            <TextField label="Dias de alerta de vencimento" inputMode="numeric" value={soon} onChange={(e) => setSoon(e.target.value.replace(/\D/g, "").slice(0, 2))} error={errors.dueSoonDays} hint="Recebimentos e pagamentos “a vencer” entram em alerta nesta janela." />
            {canEdit && (
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" loading={save.isPending}>
                  Salvar regras
                </Button>
              </div>
            )}
          </fieldset>
        </form>
      )}
    </Section>
  );
}
