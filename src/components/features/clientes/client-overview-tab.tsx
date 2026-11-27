"use client";
/** Aba "Visão geral": indicadores, dados cadastrais, observações e histórico (RF-M2-02). */
import { Section, Stat, DescriptionList } from "@/components/ui";
import { EventTimeline, Money } from "@/components/domain";
import { percent } from "@/lib/format";
import type { ClientDetail } from "./use-clients";
import { ClientBillingSection } from "./client-billing";

export function ClientOverviewTab({ client: c }: { client: ClientDetail }) {
  const i = c.indicators;
  const showMoney = i.contractedCents != null;
  const margin = showMoney && i.contractedCents ? (i.marginCents ?? 0) / i.contractedCents : null;
  const a = c.address;
  const address = [a.street && `${a.street}${a.number ? `, ${a.number}` : ""}`, a.complement, a.district, a.city && `${a.city}${a.state ? `/${a.state}` : ""}`, a.zip].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4 p-3 md:p-6">
      <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
        <Stat label="Projetos" icon="project" value={i.projects} hint="No total" />
        <Stat label="Ativos" icon="stageOpen" tone="accent" value={i.active} hint="Em andamento" />
        <Stat label="Concluídos" icon="stageDone" tone="success" value={i.completed} hint="Concluídos e arquivados" />
        {showMoney ? <Stat label="Contratado" icon="money" tone="info" value={<Money cents={i.contractedCents} compact />} hint="Soma dos projetos" /> : <Stat label="Contratado" icon="lock" value="—" hint="Sem permissão para ver valores" />}
        {showMoney && (
          <>
            <Stat label="Recebido" icon="receivable" tone="success" value={<Money cents={i.receivedCents} compact />} hint={i.contractedCents ? `${percent((i.receivedCents ?? 0) / i.contractedCents)} do contratado` : undefined} />
            <Stat label="Margem" icon="margin" tone="violet" value={<Money cents={i.marginCents} compact />} hint={margin != null ? `${percent(margin)} de margem` : undefined} />
            <Stat label="Ticket médio" icon="target" value={<Money cents={i.ticketCents} compact />} hint="Por projeto contratado" />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <Section title="Dados cadastrais" icon="client">
            <DescriptionList
              columns={1}
              items={[
                { label: "Razão social", value: c.legalName },
                { label: "Nome fantasia", value: c.tradeName },
                { label: "Segmento", value: c.segment },
                { label: "Grupo econômico", value: c.group?.name ?? "Sem grupo" },
                { label: "Endereço", value: address || "Não informado" },
              ]}
            />
          </Section>
          <ClientBillingSection client={c} />
          <Section title="Observações" icon="comment">
            {c.notes ? <p className="whitespace-pre-wrap text-sm text-fg-muted">{c.notes}</p> : <p className="text-sm text-fg-placeholder">Nenhuma observação. Use “Editar cliente” para registrar combinados e preferências.</p>}
          </Section>
        </div>
        <Section title="Histórico" description="Eventos dos projetos e do cadastro deste cliente" icon="history">
          <EventTimeline clientId={c.id} limit={20} showProject />
        </Section>
      </div>
    </div>
  );
}
