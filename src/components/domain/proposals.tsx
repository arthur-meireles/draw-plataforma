"use client";
/**
 * Propostas do projeto em cotação (RF-M3-04/05, RN-01, RN-11): versões com status, valor, parcelas,
 * datas registradas pelo sistema e arquivo anexo; nova versão, envio, aprovação (ativa o projeto) e recusa.
 */
import { useRef, useState } from "react";
import { Button, ConfirmDialog, DateInput, Dialog, EmptyState, ErrorState, Field, Icon, IconButton, MoneyField, MoneyInput, Section, SelectField, Skeleton, TextareaField, type Option } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { proposalsApi, proposalsExtraApi, type InstallmentInput } from "@/data/services";
import { usePermissions } from "@/components/layout/session";
import { fromDateInput, dateFull, fileSize, money, toDateInput } from "@/lib/format";
import type { ID } from "@/data/types";
import { Money, ProposalStatusBadge } from "./badges";
import { useFileDownload } from "./files";

type ProposalRow = Awaited<ReturnType<typeof proposalsApi.listByProject>>[number];

const RULES = ["Na aprovação", "Na entrega", "Data específica"] as const;
type RuleKey = (typeof RULES)[number];
const ruleOptions: Option<RuleKey>[] = RULES.map((r) => ({ value: r, label: r }));

interface InstallmentDraft {
  key: number;
  amount: number;
  rule: RuleKey;
  date: string;
}

let draftKey = 0;
const newDraft = (amount = 0, rule: RuleKey = "Na entrega", date = ""): InstallmentDraft => ({ key: ++draftKey, amount, rule, date });

const draftsOf = (p: ProposalRow | null): InstallmentDraft[] =>
  p?.installments.length
    ? p.installments.map((i) => newDraft(i.amountCents, i.dueRule === "Na aprovação" || i.dueRule === "Na entrega" ? i.dueRule : "Data específica", toDateInput(i.dueAt)))
    : [newDraft(0, "Na aprovação"), newDraft(0, "Na entrega")];

/** Formulário de proposta (nova versão ou edição de rascunho). Parcelas somam o valor (RN-01). */
function ProposalDialog({ projectId, proposal, onClose }: { projectId: ID; proposal: ProposalRow | null; onClose: () => void }) {
  const [amount, setAmount] = useState(proposal?.amountCents ?? 0);
  const [note, setNote] = useState(proposal?.paymentTermsNote ?? "");
  const [rows, setRows] = useState<InstallmentDraft[]>(() => draftsOf(proposal));
  const [file, setFile] = useState<File | null>(null);
  const [keepFile, setKeepFile] = useState(!!proposal?.fileId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const sum = rows.reduce((a, r) => a + r.amount, 0);
  const diff = amount - sum;

  const save = useApiMutation(
    (body: Parameters<typeof proposalsExtraApi.save>[1]) => proposalsExtraApi.save(projectId, body),
    {
      success: (p) => `Proposta v${p.version} salva como rascunho`,
      onSuccess: onClose,
      onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
    },
  );

  const submit = () => {
    const next: Record<string, string> = {};
    if (amount <= 0) next.amountCents = "Informe o valor da proposta";
    if (!rows.length) next.installments = "Informe ao menos uma parcela";
    else if (rows.some((r) => r.amount <= 0)) next.installments = "Preencha o valor de todas as parcelas";
    else if (diff !== 0) next.installments = `A soma das parcelas deve ser igual ao valor da proposta (${diff > 0 ? "faltam" : "sobram"} ${money(Math.abs(diff))})`;
    rows.forEach((r) => {
      if (r.rule === "Data específica" && !r.date) next[`date-${r.key}`] = "Informe a data";
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    const installments: InstallmentInput[] = rows.map((r) => (r.rule === "Data específica" ? { amountCents: r.amount, dueRule: null, dueAt: fromDateInput(r.date) } : { amountCents: r.amount, dueRule: r.rule, dueAt: null }));
    save.mutate({ proposalId: proposal?.id ?? null, amountCents: amount, paymentTermsNote: note, installments, file, keepFileId: keepFile ? (proposal?.fileId ?? null) : null });
  };

  const update = (key: number, patch: Partial<InstallmentDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const splitEvenly = () => {
    if (!rows.length || amount <= 0) return;
    const base = Math.floor(amount / rows.length);
    setRows((rs) => rs.map((r, i) => ({ ...r, amount: i === rs.length - 1 ? amount - base * (rs.length - 1) : base })));
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !save.isPending && onClose()}
      size="lg"
      dismissible={false}
      title={proposal ? `Editar proposta v${proposal.version}` : "Nova proposta"}
      description="A data de envio e a de aprovação são registradas pelo sistema. Depois de enviada, a proposta não pode ser editada: crie uma nova versão."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            Salvar rascunho
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <MoneyField label="Valor da proposta" required value={amount} onChange={setAmount} error={errors.amountCents} autoFocus />

        <fieldset className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-xs font-medium text-fg-muted">Parcelas e condições de pagamento</legend>
            <Button size="xs" variant="ghost" onClick={splitEvenly} disabled={amount <= 0}>
              Dividir igualmente
            </Button>
          </div>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-line p-2.5 max-md:grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[auto_9rem_minmax(0,1fr)_auto]">
                <span className="flex h-8 items-center text-xs font-medium tabular-nums text-fg-subtle max-md:hidden">{i + 1}ª</span>
                <div className="max-md:col-span-1">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-xs text-fg-subtle">R$</span>
                    <MoneyInput value={r.amount} onChange={(v) => update(r.key, { amount: v })} aria-describedby={undefined} invalid={!!errors.installments && r.amount <= 0} />
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2 max-md:col-span-2 max-md:row-start-2">
                  <div className="min-w-40 flex-1">
                    <SelectField label={undefined} aria-label={`Vencimento da parcela ${i + 1}`} options={ruleOptions} value={r.rule} onChange={(v) => v && update(r.key, { rule: v })} />
                  </div>
                  {r.rule === "Data específica" && (
                    <div className="min-w-36 flex-1">
                      <DateInput value={r.date} aria-label={`Data da parcela ${i + 1}`} invalid={!!errors[`date-${r.key}`]} onChange={(e) => update(r.key, { date: e.target.value })} />
                      {errors[`date-${r.key}`] && <p className="mt-1 text-xs text-danger">{errors[`date-${r.key}`]}</p>}
                    </div>
                  )}
                </div>
                <div className="flex h-8 items-center max-md:row-start-1 max-md:col-start-2">
                  <IconButton icon="close" label={`Remover parcela ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="ghost" icon="add" onClick={() => setRows((rs) => [...rs, newDraft(Math.max(0, diff))])}>
              Adicionar parcela
            </Button>
            <p aria-live="polite" className={`text-xs tabular-nums ${diff === 0 && amount > 0 ? "text-success" : "text-fg-subtle"}`}>
              Soma das parcelas: {money(sum)} {amount > 0 && (diff === 0 ? "· confere com o valor" : `· ${diff > 0 ? "faltam" : "sobram"} ${money(Math.abs(diff))}`)}
            </p>
          </div>
          {errors.installments && <p role="alert" className="text-xs text-danger">{errors.installments}</p>}
        </fieldset>

        <TextareaField label="Observações de pagamento" hint="Opcional. Ex.: reajuste, multa, nota fiscal." value={note} onChange={(e) => setNote(e.target.value)} rows={2} />

        <Field label="Arquivo da proposta (PDF)" hint="Opcional. Fica guardado em Arquivos, na categoria Proposta.">
          {() => (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5">
              <Icon name="proposal" size="sm" className="text-fg-subtle" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">{file ? `${file.name} · ${fileSize(file.size)}` : keepFile ? "Arquivo atual mantido" : "Nenhum arquivo selecionado"}</span>
              {(file || keepFile) && (
                <Button size="xs" variant="ghost" onClick={() => { setFile(null); setKeepFile(false); }}>
                  Remover
                </Button>
              )}
              <Button size="xs" icon="upload" onClick={() => input.current?.click()}>
                {file || keepFile ? "Trocar" : "Anexar PDF"}
              </Button>
              <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setKeepFile(false); } e.target.value = ""; }} />
            </div>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function InstallmentsSummary({ p }: { p: ProposalRow }) {
  if (!p.installments.length) return <span className="text-fg-subtle">Sem parcelas</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {p.installments.map((i) => (
        <li key={i.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-layer px-1.5 py-0.5 text-xs text-fg-muted">
          <span className="tabular-nums text-fg-subtle">{i.number}ª</span>
          <Money cents={i.amountCents} className="font-medium text-fg" />
          <span>· {i.dueRule ?? dateFull(i.dueAt)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Lista de versões da proposta com ações conforme o status. */
export function Proposals({ projectId, projectStatus, newOpen, onNewOpenChange }: { projectId: ID; projectStatus: string; newOpen: boolean; onNewOpenChange: (open: boolean) => void }) {
  const { canWriteAll } = usePermissions();
  const q = useApiQuery(["proposals", projectId], () => proposalsApi.listByProject(projectId));
  const download = useFileDownload();
  const [editing, setEditing] = useState<ProposalRow | null>(null);
  const [approving, setApproving] = useState<ProposalRow | null>(null);
  const [rejecting, setRejecting] = useState<ProposalRow | null>(null);
  const canAct = canWriteAll("commercial") && projectStatus === "cotacao";

  const send = useApiMutation((id: ID) => proposalsApi.send(id), { success: (p) => `Proposta v${p.version} enviada` });
  const approve = useApiMutation((id: ID) => proposalsApi.approve(id), {
    success: "Proposta aprovada: o projeto está ativo, com recebíveis e tarefas criados",
    onSuccess: () => setApproving(null),
  });
  const reject = useApiMutation((id: ID) => proposalsApi.reject(id), { success: "Recusa registrada", onSuccess: () => setRejecting(null) });

  return (
    <Section
      title="Propostas"
      icon="proposal"
      description="Cada versão guarda valor, parcelas e arquivo. Datas de envio e aprovação são do sistema."
      actions={
        canAct && (
          <Button size="sm" variant="primary" icon="add" onClick={() => onNewOpenChange(true)}>
            Nova proposta
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : !q.data?.length ? (
        <EmptyState compact icon="proposal" title="Nenhuma proposta ainda" description={canAct ? "Crie a primeira versão com valor, parcelas e, se quiser, o PDF." : "As propostas deste projeto aparecem aqui."} action={canAct ? { label: "Nova proposta", icon: "add", onClick: () => onNewOpenChange(true) } : undefined} />
      ) : (
        <ol className="divide-y divide-line">
          {q.data.map((p, idx) => (
            <li key={p.id} className="space-y-2.5 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-fg">v{p.version}</span>
                <ProposalStatusBadge status={p.status} />
                {idx === 0 && p.status !== "recusada" && <span className="text-2xs uppercase tracking-wide text-fg-subtle">Versão atual</span>}
                <span className="flex-1" />
                <Money cents={p.amountCents} className="text-md font-semibold text-fg" />
              </div>
              <InstallmentsSummary p={p} />
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-subtle">
                <div className="flex gap-1"><dt>Criada em</dt><dd className="text-fg-muted">{dateFull(p.createdAt)}</dd></div>
                {p.sentAt && <div className="flex gap-1"><dt>Enviada em</dt><dd className="text-fg-muted">{dateFull(p.sentAt)}</dd></div>}
                {p.approvedAt && <div className="flex gap-1"><dt>Aprovada em</dt><dd className="text-fg-muted">{dateFull(p.approvedAt)}</dd></div>}
              </dl>
              {p.paymentTermsNote && <p className="text-xs text-fg-muted">{p.paymentTermsNote}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {p.file && (
                  <Button size="xs" variant="outline" icon="file" onClick={() => download.mutate({ versionId: p.file!.currentVersionId })}>
                    {p.file.name}
                  </Button>
                )}
                <span className="flex-1" />
                {canAct && p.status === "rascunho" && (
                  <>
                    <Button size="sm" icon="edit" onClick={() => setEditing(p)}>
                      Editar rascunho
                    </Button>
                    <Button size="sm" variant="primary" icon="send" loading={send.isPending && send.variables === p.id} onClick={() => send.mutate(p.id)}>
                      Enviar proposta
                    </Button>
                  </>
                )}
                {canAct && p.status === "enviada" && (
                  <>
                    <Button size="sm" variant="destructive-ghost" onClick={() => setRejecting(p)}>
                      Registrar recusa…
                    </Button>
                    <Button size="sm" variant="primary" icon="check" onClick={() => setApproving(p)}>
                      Aprovar proposta…
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {newOpen && <ProposalDialog projectId={projectId} proposal={null} onClose={() => onNewOpenChange(false)} />}
      {editing && <ProposalDialog projectId={projectId} proposal={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title={`Aprovar proposta v${approving?.version ?? ""}?`}
        description={
          <div className="space-y-2">
            <p>Ao aprovar, o sistema faz tudo de uma vez (RN-01):</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>o projeto passa de cotação para <strong>ativo</strong>, com o valor contratado de <Money cents={approving?.amountCents} className="font-medium text-fg" />;</li>
              <li>cria os recebíveis conforme as {approving?.installments.length ?? 0} parcelas da proposta;</li>
              <li>gera as tarefas do modelo do tipo de projeto, por etapa;</li>
              <li>as demais propostas abertas são marcadas como recusadas.</li>
            </ul>
          </div>
        }
        confirmLabel="Aprovar proposta"
        loading={approve.isPending}
        onConfirm={() => approving && approve.mutate(approving.id)}
      />
      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Registrar recusa da v${rejecting?.version ?? ""}?`}
        description="A cotação volta para Negociação e você pode enviar uma nova versão."
        confirmLabel="Registrar recusa"
        destructive
        loading={reject.isPending}
        onConfirm={() => rejecting && reject.mutate(rejecting.id)}
      />
    </Section>
  );
}
