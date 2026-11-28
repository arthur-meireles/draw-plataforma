"use client";
import Link from "next/link";
import { useState } from "react";
import { EventTimeline, Money, ProjectCode, ReceivableKindBadge, ReceivableStatusBadge } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { Button, ConfirmDialog, DescriptionList, Section, Sheet } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { financeApi, financeMedioApi, reversalsApi } from "@/data/services";
import { dateFull, formatCnpj } from "@/lib/format";
import { CollectionNoteEditor } from "./collection-note-editor";
import { EditReceivableDialog, IssueInvoiceDialog, ReceiveDialog } from "./receivable-dialogs";
import type { ReceivableRow } from "./types";

type Dlg = "issue" | "receive" | "edit" | "cancel" | "reactivate" | "cancelInvoice" | "undoReceipt" | null;

export function ReceivableSheet({ row, onClose }: { row: ReceivableRow | null; onClose: () => void }) {
  const { canWriteAll } = usePermissions();
  const [dlg, setDlg] = useState<Dlg>(null);
  const cancel = useApiMutation((a: { id: string; reason: string }) => financeApi.cancelReceivable(a.id, a.reason), { success: "Lançamento cancelado.", onSuccess: () => setDlg(null) });
  const reactivate = useApiMutation((a: { id: string; reason: string }) => financeMedioApi.reactivateReceivable(a.id, a.reason), { success: "Lançamento reativado.", onSuccess: () => setDlg(null) });
  const cancelInvoice = useApiMutation((a: { id: string; reason: string }) => reversalsApi.cancelInvoice(a.id, a.reason), { success: "NF cancelada. O lançamento voltou para Previsto.", onSuccess: () => setDlg(null) });
  const undoReceipt = useApiMutation((a: { id: string; reason: string }) => reversalsApi.undoReceipt(a.id, a.reason), { success: "Baixa estornada. O lançamento voltou para Faturado.", onSuccess: () => setDlg(null) });
  const writable = canWriteAll("receivables");
  const open = !!row && row.status !== "cancelado" && row.status !== "recebido";
  const issued = !!row?.issuedAt;

  return (
    <>
      <Sheet
        open={!!row}
        onOpenChange={(o) => !o && onClose()}
        width="md"
        ariaTitle="Detalhe do lançamento a receber"
        title={row ? `${row.projectCode} · A receber` : undefined}
        footer={
          row && writable && row.status === "recebido" ? (
            <div className="flex w-full justify-end">
              <Button variant="secondary" icon="undo" onClick={() => setDlg("undoReceipt")}>
                Estornar baixa…
              </Button>
            </div>
          ) : row && writable && open ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="secondary" icon="edit" onClick={() => setDlg("edit")}>
                  Editar
                </Button>
                {issued ? (
                  <Button variant="ghost" onClick={() => setDlg("cancelInvoice")} className="text-danger">
                    Cancelar NF…
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setDlg("cancel")} className="text-danger">
                    Cancelar lançamento…
                  </Button>
                )}
              </div>
              {issued ? (
                <Button variant="primary" icon="success" onClick={() => setDlg("receive")}>
                  Dar baixa
                </Button>
              ) : (
                <Button variant="primary" icon="invoice" onClick={() => setDlg("issue")}>
                  Emitir NF
                </Button>
              )}
            </div>
          ) : row && writable && row.status === "cancelado" ? (
            <div className="flex w-full justify-end">
              <Button variant="secondary" icon="undo" onClick={() => setDlg("reactivate")}>
                Reativar lançamento…
              </Button>
            </div>
          ) : undefined
        }
      >
        {row && (
          <div className="space-y-5 p-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <ReceivableStatusBadge status={row.status} />
                <ReceivableKindBadge kind={row.kind} />
              </div>
              <h2 className="text-md font-semibold text-fg">{row.description}</h2>
              <p className="text-xl font-semibold tabular-nums text-fg">
                <Money cents={row.amountCents} />
              </p>
            </div>
            <DescriptionList
              columns={1}
              items={[
                {
                  label: "Projeto",
                  value: (
                    <Link href={`/projetos/${row.projectCode}?aba=financeiro`} className="inline-flex items-center gap-2 hover:underline">
                      <ProjectCode code={row.projectCode} />
                      <span>{row.projectTitle}</span>
                    </Link>
                  ),
                },
                { label: "Cliente", value: row.clientName },
                { label: "CNPJ", value: formatCnpj(row.clientCnpj) },
                { label: "Origem", value: row.kind === "adicional" ? "Cobrança adicional" : row.proposalInstallmentId ? "Parcela da proposta aprovada (RN-01/RN-02)" : "Lançamento avulso ou importado" },
                { label: "Vencimento", value: row.dueBasis ? `${dateFull(row.expectedAt)} · ${row.dueBasis}` : dateFull(row.expectedAt) },
                { label: "Impostos sobre o faturamento", value: <Money cents={row.taxCents} /> },
                ...(row.status === "cancelado" && row.cancelReason ? [{ label: "Motivo do cancelamento", value: row.cancelReason }] : []),
                { label: "NF", value: row.invoiceNumber ? `Nº ${row.invoiceNumber}${row.issuedAt ? ` · emitida em ${dateFull(row.issuedAt)}` : ""}` : "Ainda não emitida" },
                { label: "Recebimento", value: row.receivedAt ? dateFull(row.receivedAt) : "—" },
              ]}
            />
            <CollectionNoteEditor row={row} writable={writable} />
            <Section title="Histórico" icon="history">
              <EventTimeline entityType="receivable" entityId={row.id} compact />
            </Section>
          </div>
        )}
      </Sheet>
      {row && dlg === "issue" && <IssueInvoiceDialog row={row} open onOpenChange={(o) => !o && setDlg(null)} />}
      {row && dlg === "receive" && <ReceiveDialog row={row} open onOpenChange={(o) => !o && setDlg(null)} />}
      {row && dlg === "edit" && <EditReceivableDialog row={row} open onOpenChange={(o) => !o && setDlg(null)} />}
      <ConfirmDialog
        open={!!row && dlg === "cancelInvoice"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Cancelar a NF emitida?"
        description="O lançamento volta para Previsto, sem número, data e PDF da nota (ficam no histórico). Use quando a NF foi cancelada na prefeitura ou emitida com erro; depois, emita a nota correta."
        confirmLabel="Cancelar NF"
        cancelLabel="Voltar"
        destructive
        reason={{ label: "Motivo do cancelamento da NF", placeholder: "Ex.: NF emitida com CNPJ errado", required: true }}
        loading={cancelInvoice.isPending}
        onConfirm={(reason) => row && cancelInvoice.mutate({ id: row.id, reason: reason ?? "" })}
      />
      <ConfirmDialog
        open={!!row && dlg === "undoReceipt"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Estornar a baixa?"
        description="O lançamento volta para Faturado (a NF continua emitida) e sai do recebido do mês. O estorno fica no histórico com o motivo."
        confirmLabel="Estornar baixa"
        cancelLabel="Voltar"
        destructive
        reason={{ label: "Motivo do estorno", placeholder: "Ex.: baixa registrada no lançamento errado", required: true }}
        loading={undoReceipt.isPending}
        onConfirm={(reason) => row && undoReceipt.mutate({ id: row.id, reason: reason ?? "" })}
      />
      <ConfirmDialog
        open={!!row && dlg === "cancel"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Cancelar lançamento?"
        description="O lançamento sai das somas de contas a receber e da margem do projeto. O histórico é mantido."
        confirmLabel="Cancelar lançamento"
        cancelLabel="Voltar"
        destructive
        reason={{ label: "Motivo do cancelamento", placeholder: "Ex.: parcela lançada em duplicidade", required: true }}
        loading={cancel.isPending}
        onConfirm={(reason) => row && cancel.mutate({ id: row.id, reason: reason ?? "" })}
      />
      <ConfirmDialog
        open={!!row && dlg === "reactivate"}
        onOpenChange={(o) => !o && setDlg(null)}
        title="Reativar o lançamento?"
        description="O lançamento volta a contar em contas a receber e na margem do projeto (Previsto, ou Faturado se a NF continuar emitida). A reativação fica no histórico."
        confirmLabel="Reativar lançamento"
        cancelLabel="Voltar"
        reason={{ label: "Motivo da reativação", placeholder: "Ex.: cancelado por engano", required: true }}
        loading={reactivate.isPending}
        onConfirm={(reason) => row && reactivate.mutate({ id: row.id, reason: reason ?? "" })}
      />
    </>
  );
}
