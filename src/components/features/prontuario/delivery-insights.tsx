"use client";
import { useEffect, useState } from "react";
import { Button, ConfirmDialog, DateField, Dialog, EmptyState, ErrorState, Icon, Section, Skeleton, TextField, TextareaField, RowActions } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { deliverableMetricsApi, milestonesApi, type DeliverableMetrics } from "@/data/services";
import type { DeliverableMetricKey, ID } from "@/data/types";
import { dateFull, fromDateInput, toDateInput } from "@/lib/format";

const METRICS: { key: DeliverableMetricKey; label: string; unit: string }[] = [
  { key: "paginas_antes", label: "Páginas antes", unit: "pág." },
  { key: "paginas_depois", label: "Páginas depois", unit: "pág." },
  { key: "tempo_leitura_antes", label: "Tempo de leitura antes", unit: "min" },
  { key: "tempo_leitura_depois", label: "Tempo de leitura depois", unit: "min" },
];

const reduction = (before?: number, after?: number) => (before && after != null ? Math.round(((before - after) / before) * 100) : null);

function MilestoneDialog({ projectId, onClose }: { projectId: ID; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [learning, setLearning] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useApiMutation(() => milestonesApi.create(projectId, { title, date: fromDateInput(date) ?? "", learning }), {
    success: "Marco registrado",
    onSuccess: onClose,
    onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Registrar marco ou aprendizado"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={create.isPending} onClick={() => create.mutate(undefined)}>Registrar marco</Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Marco" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Primeira versão aprovada pelo jurídico do cliente" error={errors.title} />
        <DateField label="Data" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
        <TextareaField label="Aprendizado" hint="Opcional. O que a equipe leva deste momento para os próximos projetos?" value={learning} onChange={(e) => setLearning(e.target.value)} rows={3} />
      </div>
    </Dialog>
  );
}

/** Marcos, aprendizados e métricas de entrega do projeto (RF-M4-14). */
export function DeliveryInsights({ projectId, editable }: { projectId: ID; editable: boolean }) {
  const { canWriteAll, role } = usePermissions();
  const canEdit = editable && (canWriteAll("projects") || role === "operacao");
  const milestones = useApiQuery(["milestones", projectId], () => milestonesApi.list(projectId));
  const metrics = useApiQuery(["deliverable-metrics", projectId], () => deliverableMetricsApi.get(projectId));
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ID | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (metrics.data) setDraft(Object.fromEntries(METRICS.map((m) => [m.key, metrics.data![m.key] != null ? String(metrics.data![m.key]) : ""])));
  }, [metrics.data]);

  const save = useApiMutation(
    () => {
      const values: Partial<Record<DeliverableMetricKey, number | null>> = {};
      METRICS.forEach((m) => {
        const raw = (draft[m.key] ?? "").replace(",", ".").trim();
        values[m.key] = raw === "" ? null : Number(raw);
      });
      return deliverableMetricsApi.save(projectId, values);
    },
    { success: "Métricas salvas", onSuccess: () => setErrors({}), onError: (e) => e.fieldErrors && setErrors(e.fieldErrors) },
  );
  const remove = useApiMutation((id: ID) => milestonesApi.remove(id), { success: "Marco removido", onSuccess: () => setRemoving(null) });

  const m = (metrics.data ?? {}) as DeliverableMetrics;
  const pages = reduction(m.paginas_antes, m.paginas_depois);
  const reading = reduction(m.tempo_leitura_antes, m.tempo_leitura_depois);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Marcos e aprendizados" icon="milestone" actions={canEdit && <Button size="sm" icon="add" onClick={() => setAdding(true)}>Registrar marco</Button>} bodyClassName="p-0">
        {milestones.error ? (
          <ErrorState error={milestones.error} onRetry={() => milestones.refetch()} />
        ) : milestones.isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : !milestones.data?.length ? (
          <EmptyState compact icon="milestone" title="Nenhum marco registrado" description="Registre momentos importantes e o que a equipe aprendeu para usar nos próximos projetos." action={canEdit ? { label: "Registrar marco", icon: "add", onClick: () => setAdding(true) } : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {milestones.data.map((x) => (
              <li key={x.id} className="flex items-start gap-3 px-4 py-3">
                <Icon name="milestone" size="sm" className="mt-0.5 text-fg-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{x.title}</p>
                  <p className="text-xs text-fg-subtle">{dateFull(x.date)}</p>
                  {x.learning && <p className="mt-1 rounded-md bg-layer px-2 py-1.5 text-xs text-fg-muted">Aprendizado: {x.learning}</p>}
                </div>
                {canEdit && <RowActions items={[{ label: "Remover marco…", icon: "delete", destructive: true, onSelect: () => setRemoving(x.id) }]} />}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Métricas de entrega" icon="chart" description="Antes e depois do trabalho da Draw no documento." actions={canEdit && <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Salvar métricas</Button>}>
        {metrics.error ? (
          <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} />
        ) : metrics.isLoading ? (
          <Skeleton className="h-28" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {METRICS.map((x) => (
                <TextField key={x.key} label={x.label} inputMode="decimal" disabled={!canEdit} value={draft[x.key] ?? ""} onChange={(e) => setDraft({ ...draft, [x.key]: e.target.value })} suffix={<span className="px-2 text-xs text-fg-subtle">{x.unit}</span>} error={errors[x.key]} placeholder="—" />
              ))}
            </div>
            {(pages != null || reading != null) && (
              <p className="rounded-md bg-success-subtle px-3 py-2 text-xs text-success">
                {pages != null && <>Documento {pages >= 0 ? `${pages}% mais curto` : `${-pages}% mais longo`}. </>}
                {reading != null && <>Leitura {reading >= 0 ? `${reading}% mais rápida` : `${-reading}% mais lenta`}.</>}
              </p>
            )}
          </div>
        )}
      </Section>

      {adding && <MilestoneDialog projectId={projectId} onClose={() => setAdding(false)} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remover marco?" description="O marco deixa de aparecer no projeto." confirmLabel="Remover marco" destructive loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing)} />
    </div>
  );
}
