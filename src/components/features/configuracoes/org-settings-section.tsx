"use client";
import { useEffect, useState } from "react";
import { usePermissions } from "@/components/layout/session";
import { Button, Section, Skeleton, Switch, TextField } from "@/components/ui";
import { useApiMutation, useOrganization } from "@/data/hooks";
import { usersApi } from "@/data/services";
import { focusFirstInvalid } from "@/lib/focus";
import { dateTime, formatPhone } from "@/lib/format";

/** Regras da organização: dia de pagamento de freelancers (RN-06), dias de alerta de vencimento (RF-M4-13), alíquota de imposto e contato do Financeiro (RN-67). */
export function OrgSettingsSection() {
  const p = usePermissions();
  const canEdit = p.canWriteAll("settings");
  const org = useOrganization();
  const [day, setDay] = useState("");
  const [soon, setSoon] = useState("");
  const [tax, setTax] = useState("");
  const [mfaAdmins, setMfaAdmins] = useState(true);
  const [finEmail, setFinEmail] = useState("");
  const [finPhone, setFinPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const settings = org.data?.org.settings;
  useEffect(() => {
    if (settings) {
      setDay(String(settings.freelancerPaymentDay));
      setSoon(String(settings.dueSoonDays));
      setTax(String(settings.taxRatePct ?? 6).replace(".", ","));
      setMfaAdmins(settings.requireMfaForAdmins ?? true);
      setFinEmail(settings.financeContactEmail ?? "");
      setFinPhone(settings.financeContactPhone ?? "");
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
    const t = Number(tax.replace(",", "."));
    if (!Number.isInteger(d) || d < 1 || d > 28) errs.freelancerPaymentDay = "Escolha um dia entre 1 e 28";
    if (!Number.isInteger(s) || s < 1 || s > 30) errs.dueSoonDays = "Use de 1 a 30 dias";
    if (!tax.trim() || !Number.isFinite(t) || t < 0 || t > 30) errs.taxRatePct = "Use uma alíquota entre 0% e 30%";
    if (finEmail.trim() && !/^\S+@\S+\.\S+$/.test(finEmail.trim())) errs.financeContactEmail = "Informe um e-mail válido, ex.: financeiro@draw.com.br";
    setErrors(errs);
    if (Object.keys(errs).length) return focusFirstInvalid();
    save.mutate({ freelancerPaymentDay: d, dueSoonDays: s, taxRatePct: Math.round(t * 100) / 100, financeContactEmail: finEmail.trim() || null, financeContactPhone: finPhone.trim() || null, requireMfaForAdmins: mfaAdmins });
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
            <TextField label="Alíquota de imposto (%)" inputMode="decimal" suffix="%" value={tax} onChange={(e) => setTax(e.target.value.replace(/[^\d,.]/g, "").slice(0, 5))} error={errors.taxRatePct} hint="Entre 0% e 30%. Calcula o imposto dos novos recebíveis; os já lançados não mudam." />
            <div className="sm:col-span-2">
              <Switch label="Exigir verificação em duas etapas dos administradores" description="Administrador sem 2FA cadastra o aplicativo autenticador no próximo login e não consegue desligar (RN-37)." checked={mfaAdmins} onCheckedChange={setMfaAdmins} />
            </div>
            <TextField label="E-mail do Financeiro" type="email" autoComplete="off" value={finEmail} onChange={(e) => setFinEmail(e.target.value)} error={errors.financeContactEmail} hint="Aparece para freelancers no link de NF e nas mensagens de cobrança. Em branco: e-mail de quem tem perfil Financeiro." />
            <TextField label="Telefone/WhatsApp do Financeiro" inputMode="tel" value={finPhone} onChange={(e) => setFinPhone(formatPhone(e.target.value))} placeholder="(11) 99999-0000" hint="Opcional. Mostrado junto com o e-mail." />
            {canEdit && (
              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" loading={save.isPending}>
                  Salvar regras
                </Button>
              </div>
            )}
          </fieldset>
          {org.data?.lastChange && (
            <p className="mt-4 border-t border-line pt-3 text-xs text-fg-subtle">
              Última alteração por <span className="font-medium text-fg-muted">{org.data.lastChange.by}</span> em {dateTime(org.data.lastChange.at)}
              {org.data.lastChange.changes.length > 0 && <> · {org.data.lastChange.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`).join("; ")}</>}
            </p>
          )}
        </form>
      )}
    </Section>
  );
}
