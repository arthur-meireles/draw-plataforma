"use client";
import { Callout, Progress, Section, Skeleton } from "@/components/ui";

export interface MailUsageData {
  brevo: number;
  resend: number;
  brevoQuota: number;
  resendQuota: number;
}

const toneOf = (used: number, quota: number) => (used >= quota ? "danger" : used / quota >= 0.8 ? "warning" : "accent");

function Row({ name, role, used, quota }: { name: string; role: string; used: number; quota: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-fg">
          {name} <span className="text-xs font-normal text-fg-subtle">· {role}</span>
        </span>
        <span className="tabular-nums text-fg-muted">
          {used} de {quota} hoje
        </span>
      </div>
      <Progress value={used} max={quota} tone={toneOf(used, quota)} label={`Uso diário do ${name}`} />
    </div>
  );
}

/** Uso diário por provedor contra a cota gratuita (RNF-12). */
export function MailUsage({ usage, isLoading }: { usage?: MailUsageData; isLoading?: boolean }) {
  const both = !!usage && usage.brevo >= usage.brevoQuota && usage.resend >= usage.resendQuota;
  return (
    <Section title="Uso diário" description="Envios do sistema contra a cota gratuita de cada provedor" icon="chart">
      {isLoading || !usage ? (
        <div className="space-y-4">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      ) : (
        <div className="space-y-4">
          <Row name="Brevo" role="principal" used={usage.brevo} quota={usage.brevoQuota} />
          <Row name="Resend" role="reserva" used={usage.resend} quota={usage.resendQuota} />
          <p className="text-xs text-fg-subtle">Ao atingir a cota do Brevo ou em caso de falha, a fila usa o Resend. Se os dois estiverem na cota, os envios esperam até o dia seguinte.</p>
          {both && <Callout tone="danger" title="Cotas gratuitas esgotadas hoje">Os e-mails ficam na fila e saem amanhã. Convites e recuperação de senha têm prioridade.</Callout>}
        </div>
      )}
    </Section>
  );
}
