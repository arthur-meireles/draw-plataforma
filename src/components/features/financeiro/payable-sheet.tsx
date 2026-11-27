"use client";
import Link from "next/link";
import { useState } from "react";
import { EventTimeline, PayableStatusBadge, ProjectCode } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { toast } from "sonner";
import { Badge, Button, Callout, ConfirmDialog, DateField, DescriptionList, Dialog, Section, Sheet, copyText } from "@/components/ui";
import { useApiMutation, useOrganization } from "@/data/hooks";
import { financeApi, payablesExtraApi, reversalsApi } from "@/data/services";
import { dateFull, fromDateInput, money, toDateInput } from "@/lib/format";
import { PAYABLE_KIND_LABEL, PayableAmount, payableDiff } from "./payable-bits";
import { RegisterInvoiceDialog } from "./register-invoice-dialog";
import type { PayableRow } from "./types";

type Dlg = "pay" | "divergent" | "approve" | "register" | "reissue" | "undoApproval" | "reversePayment" | null;

const linkUrl = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/nf/${token}`;

function PayDialog({ row, open, onOpenChange }: { row: PayableRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [date, setDate] = useState(toDateInput(new Date().toISOString()));
  const [error, setError] = useState<string>();
  const m = useApiMutation(() => financeApi.pay(row.id, fromDateInput(date)!), { success: "Pagamento registrado.", onSuccess: () => onOpenChange(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title="Registrar pagamento"
      description={`${money(row.invoicedAmountCents ?? row.agreedAmountCents)} · ${row.freelancerName ?? row.description}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            onClick={() => {
              if (!date) return setError("Informe a data do pagamento");
              setError(undefined);
              m.mutate(undefined);
            }}
          >
            Confirmar pagamento
          </Button>
        </>
      }
    >
      <DateField label="Data do pagamento" required autoFocus value={date} onChange={(e) => setDate(e.target.value)} error={error} />
    </Dialog>
  );
}

export function PayableSheet({ row, onClose }: { row: PayableRow | null; onClose: () => void }) {
  const { canWriteAll, isFreelancer } = usePermissions();
  const [dlg, setDlg] = useState<Dlg>(null);
  const writable = canWriteAll("payables");
  const approve = useApiMutation((id: string) => financeApi.approvePayable(id), { success: "NF aprovada. Já pode registrar o pagamento.", onSuccess: () => setDlg(null) });
  const divergent = useApiMutation((a: { id: string; note: string }) => financeApi.markDivergent(a.id, a.note), { success: "Marcada como divergente.", onSuccess: () => setDlg(null) });
  const resend = useApiMutation((id: string) => financeApi.resendInvoiceLink(id), { success: "Link reenviado ao freelancer por e-mail, válido por mais 30 dias." });
  const reissue = useApiMutation((a: { id: string; reason: string }) => payablesExtraApi.requestNewInvoice(a.id, a.reason), { success: "Pedido de nova NF enviado ao freelancer, com o motivo.", onSuccess: () => setDlg(null) });
  const undoApproval = useApiMutation((a: { id: string; reason: string }) => reversalsApi.undoPayableApproval(a.id, a.reason), { success: "Aprovação desfeita. A NF voltou para conferência.", onSuccess: () => setDlg(null) });
  const reversePayment = useApiMutation((a: { id: string; reason: string }) => reversalsApi.reversePayment(a.id, a.reason), { success: "Pagamento estornado. A conta voltou para Aprovado.", onSuccess: () => setDlg(null) });
  const org = useOrganization();
  const payDay = org.data?.org.settings.freelancerPaymentDay ?? 20;

  const diff = row ? payableDiff(row) : null;
  const canReview = !!row && writable && (row.status === "em_conferencia" || row.status === "divergente");
  const canPay = !!row && writable && row.status === "aprovado";
  // RN-47 — ações reversas (motivo obrigatório, ficam no histórico)
  const canUndoApproval = canPay && row?.kind === "freelancer" && row.invoicedAmountCents != null;
  const canReversePayment = !!row && writable && row.status === "pago";
  const isFl = row?.kind === "freelancer";
  // RN-41: NF chegou por outro canal · RN-42: NF em conferência/divergente volta ao freelancer
  const canRegister = !!row && writable && isFl && (row.status === "aguardando_nf" || row.status === "divergente");
  const canReissue = !!row && writable && isFl && (row.status === "em_conferencia" || row.status === "divergente");
  const req = row?.invoiceRequest;

  const copy = async (token: string) => ((await copyText(linkUrl(token))) ? toast.success("Link copiado.") : toast.error("Não foi possível copiar. Selecione o link e copie manualmente."));

  return (
    <>
      <Sheet
        open={!!row}
        onOpenChange={(o) => !o && onClose()}
        width="md"
        ariaTitle="Detalhe da conta a pagar"
        title={row ? `${row.projectCode ?? "Administrativo"} · A pagar` : undefined}
        footer={
          row && (canReview || canPay || canRegister || canReversePayment) ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {canUndoApproval && (
                  <Button variant="ghost" icon="undo" onClick={() => setDlg("undoApproval")}>
                    Desfazer aprovação…
                  </Button>
                )}
                {canReversePayment && (
                  <Button variant="secondary" icon="undo" onClick={() => setDlg("reversePayment")}>
                    Estornar pagamento…
                  </Button>
                )}
                {canReissue && (
                  <Button variant="ghost" className="text-danger" onClick={() => setDlg("reissue")}>
                    Recusar e pedir nova NF…
                  </Button>
                )}
                {canReview && row.status === "em_conferencia" && (
                  <Button variant="ghost" className="text-danger" onClick={() => setDlg("divergent")}>
                    Marcar divergente…
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {canRegister && (
                  <Button variant={row.status === "aguardando_nf" ? "primary" : "secondary"} icon="invoice" onClick={() => setDlg("register")}>
                    Registrar NF manualmente…
                  </Button>
                )}
                {canReview && (
                  <Button variant="primary" icon="approval" loading={approve.isPending} onClick={() => (row.status === "divergente" ? setDlg("approve") : approve.mutate(row.id))}>
                    Aprovar NF
                  </Button>
                )}
                {canPay && (
                  <Button variant="primary" icon="payment" onClick={() => setDlg("pay")}>
                    Registrar pagamento
                  </Button>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        {row && (
          <div className="space-y-5 p-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <PayableStatusBadge status={row.status} />
                <Badge>{PAYABLE_KIND_LABEL[row.kind]}</Badge>
              </div>
              <h2 className="text-md font-semibold text-fg">{row.freelancerName ?? row.description}</h2>
              {row.freelancerName && <p className="text-sm text-fg-muted">{row.description}</p>}
            </div>

            {row.kind === "freelancer" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-line bg-surface-2 p-3">
                  <p className="text-xs text-fg-subtle">Valor acordado</p>
                  <p className="mt-1 text-md font-semibold">
                    <PayableAmount cents={row.agreedAmountCents} />
                  </p>
                </div>
                <div className={diff != null ? "rounded-lg border border-danger/40 bg-danger-subtle p-3" : "rounded-lg border border-line bg-surface-2 p-3"}>
                  <p className="text-xs text-fg-subtle">Valor da NF</p>
                  <p className={diff != null ? "mt-1 text-md font-semibold text-danger" : "mt-1 text-md font-semibold"}>{row.invoicedAmountCents == null ? <span className="text-fg-subtle">Aguardando</span> : <PayableAmount cents={row.invoicedAmountCents} />}</p>
                  {diff != null && (
                    <p className="mt-0.5 text-xs text-danger">
                      {diff > 0 ? "Acima" : "Abaixo"} do acordado em {money(Math.abs(diff))}
                    </p>
                  )}
                </div>
              </div>
            )}
            {row.divergenceNote && (
              <div role="alert" className="rounded-lg border border-danger/40 bg-danger-subtle p-3 text-sm text-danger">
                <p className="font-medium">Divergência (RN-04)</p>
                <p className="mt-0.5">{row.divergenceNote}</p>
              </div>
            )}

            <DescriptionList
              columns={1}
              items={[
                { label: "Projeto", hidden: !row.projectCode, value: <Link href={`/projetos/${row.projectCode}?aba=financeiro`} className="inline-flex items-center gap-2 hover:underline"><ProjectCode code={row.projectCode ?? ""} />{row.projectTitle}</Link> },
                { label: "Valor", hidden: row.kind === "freelancer", value: <PayableAmount cents={row.agreedAmountCents} /> },
                { label: "Vencimento", value: <span className={row.isOverdue ? "text-danger" : undefined}>{dateFull(row.dueAt)}{row.kind === "freelancer" ? ` · dia ${payDay} do mês seguinte à conclusão (RN-06)` : ""}</span> },
                { label: "NF", value: row.invoiceNumber ? `Nº ${row.invoiceNumber}${row.invoiceIssuedAt ? ` · emitida em ${dateFull(row.invoiceIssuedAt)}` : ""}` : "Ainda não enviada", copy: row.invoiceNumber },
                { label: "Pagamento", hidden: !row.paidAt, value: dateFull(row.paidAt) },
              ]}
            />

            {row.status === "aguardando_nf" && req?.reissueReason && (
              <Callout tone="warning" title={`Nova NF pedida${req.reissueRequestedAt ? ` em ${dateFull(req.reissueRequestedAt)}` : ""}`}>
                {req.reissueReason}
              </Callout>
            )}

            {req?.submittedAt && (
              <Section title={req.source === "manual" ? "NF registrada pelo Financeiro" : "Dados declarados pelo freelancer"} description={`${req.source === "manual" ? "Registrada" : "Enviados"} em ${dateFull(req.submittedAt)}`} icon="freelancers">
                <DescriptionList
                  columns={1}
                  items={[
                    { label: "Razão social / nome", value: req.declaredLegalName, copy: req.declaredLegalName },
                    { label: "CPF / CNPJ", value: req.declaredDocument, copy: req.declaredDocument },
                    { label: "Chave PIX", value: req.declaredPixKey, copy: req.declaredPixKey },
                    { label: "Nº da NF", value: req.declaredInvoiceNumber, copy: req.declaredInvoiceNumber },
                    { label: "Valor declarado", value: <PayableAmount cents={req.declaredAmountCents} /> },
                  ]}
                />
              </Section>
            )}

            {row.kind === "freelancer" && row.shareToken && (
              <Section title="Link de envio da NF" description="O freelancer envia nota e dados de pagamento sem precisar de login." icon="link">
                {isFreelancer ? (
                  row.status === "aguardando_nf" && (
                    <Button variant="primary" icon="invoice" asChild>
                      <Link href={`/nf/${row.shareToken}`}>Enviar minha NF</Link>
                    </Button>
                  )
                ) : (
                  <div className="space-y-3">
                    <div className="break-all rounded-md border border-line bg-layer px-2.5 py-2 font-mono text-xs text-fg-muted">/nf/{row.shareToken}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" icon="copy" onClick={() => copy(row.shareToken!)}>
                        Copiar link
                      </Button>
                      <Button variant="secondary" size="sm" icon="externalLink" asChild>
                        <Link href={`/nf/${row.shareToken}`} target="_blank">
                          Abrir formulário
                        </Link>
                      </Button>
                      {writable && row.status !== "pago" && (
                        <Button variant="secondary" size="sm" icon="send" loading={resend.isPending} onClick={() => resend.mutate(row.id)}>
                          Reenviar link
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {!isFreelancer && (
              <Section title="Histórico" icon="history">
                <EventTimeline entityType="payable" entityId={row.id} compact />
              </Section>
            )}
          </div>
        )}
      </Sheet>
      {row && dlg === "pay" && <PayDialog row={row} open onOpenChange={(o) => !o && setDlg(null)} />}
      {row && dlg === "register" && <RegisterInvoiceDialog row={row} open onOpenChange={(o) => !o && setDlg(null)} />}
      <ConfirmDialog
        open={!!row && dlg === "reissue"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Recusar NF e pedir uma nova"
        description="A conta volta para Aguardando NF, a nota enviada sai do lançamento (fica no histórico) e o freelancer recebe por e-mail — e na Caixa de entrada, se tiver login — o link renovado com o motivo abaixo."
        confirmLabel="Pedir nova NF"
        destructive
        reason={{ label: "O que o freelancer precisa corrigir", placeholder: "Ex.: emita a NF com o valor acordado de R$ 2.000,00", required: true }}
        loading={reissue.isPending}
        onConfirm={(reason) => row && reissue.mutate({ id: row.id, reason: reason ?? "" })}
      />
      <ConfirmDialog
        open={!!row && dlg === "divergent"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Marcar NF como divergente"
        description="Registra a divergência e avisa o freelancer com o motivo (Caixa de entrada, se tiver login, e e-mail). A nota continua com a Draw; para devolvê-la ao freelancer, use “Recusar e pedir nova NF…”."
        confirmLabel="Marcar divergente"
        destructive
        reason={{ label: "Motivo da divergência", placeholder: "Ex.: valor da NF difere do combinado em reunião", required: true }}
        loading={divergent.isPending}
        onConfirm={(note) => row && divergent.mutate({ id: row.id, note: note ?? "" })}
      />
      <ConfirmDialog
        open={!!row && dlg === "undoApproval"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Desfazer a aprovação?"
        description="A conta volta para Em conferência (ou Divergente, se o valor da NF difere do acordado) e deixa de poder ser paga até nova aprovação."
        confirmLabel="Desfazer aprovação"
        cancelLabel="Voltar"
        reason={{ label: "Motivo", placeholder: "Ex.: aprovada antes de conferir os dados bancários", required: true }}
        loading={undoApproval.isPending}
        onConfirm={(reason) => row && undoApproval.mutate({ id: row.id, reason: reason ?? "" })}
      />
      <ConfirmDialog
        open={!!row && dlg === "reversePayment"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Estornar o pagamento?"
        description="A conta volta para Aprovado, sem data de pagamento. O freelancer é avisado do estorno com o motivo (Caixa de entrada e e-mail)."
        confirmLabel="Estornar pagamento"
        cancelLabel="Voltar"
        destructive
        reason={{ label: "Motivo do estorno", placeholder: "Ex.: PIX devolvido pelo banco", required: true }}
        loading={reversePayment.isPending}
        onConfirm={(reason) => row && reversePayment.mutate({ id: row.id, reason: reason ?? "" })}
      />
      <ConfirmDialog
        open={!!row && dlg === "approve"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Aprovar NF divergente?"
        description={row && `A NF de ${money(row.invoicedAmountCents)} difere do acordado (${money(row.agreedAmountCents)}). Ao aprovar, o valor da NF passa a ser o valor a pagar.`}
        confirmLabel="Aprovar mesmo assim"
        loading={approve.isPending}
        onConfirm={() => row && approve.mutate(row.id)}
      />
    </>
  );
}
