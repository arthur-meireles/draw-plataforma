"use client";
/**
 * RN-67 — cobrança sem e-mail interno: mensagem pronta para copiar (destinatário, assunto e texto) e registro de
 * "cobrança enviada" (canal + observação), que entra na nota de cobrança e no histórico.
 */
import { useState } from "react";
import { Button, Callout, Copyable, CopyButton, Dialog, DescriptionList, SelectField, Skeleton, ErrorState, TextField } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { collectionApi, type CollectionChannel } from "@/data/services";
import type { ReceivableRow } from "./types";

const CHANNELS: { value: CollectionChannel; label: string }[] = [
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telefone", label: "Telefone" },
  { value: "outro", label: "Outro canal" },
];

export function CollectionDialog({ row, open, onOpenChange }: { row: ReceivableRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const q = useApiQuery(["collection-message", row.id], () => collectionApi.message(row.id), { enabled: open, retry: false });
  const [channel, setChannel] = useState<CollectionChannel | null>("email");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const sent = useApiMutation(() => collectionApi.registerSent(row.id, { channel: channel!, note }), {
    success: "Cobrança registrada na nota e no histórico.",
    onSuccess: () => {
      setNote("");
      onOpenChange(false);
    },
  });
  const m = q.data;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={m?.overdue ? "Cobrar pagamento vencido" : "Enviar cobrança"}
      description={`${row.projectCode} · ${row.clientName}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            variant="primary"
            icon="success"
            loading={sent.isPending}
            onClick={() => {
              if (!channel) return setError("Escolha o canal usado");
              setError(undefined);
              sent.mutate(undefined);
            }}
          >
            Registrar cobrança enviada
          </Button>
        </>
      }
    >
      {q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : m ? (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">A plataforma não envia e-mail ao cliente. Copie a mensagem, envie pelo seu e-mail ou WhatsApp e registre o envio aqui.</p>
          {m.to ? (
            <DescriptionList
              columns={1}
              items={[
                { label: "Para", value: m.to.name },
                { label: "E-mail", value: m.to.email, copy: m.to.email },
                { label: "Telefone", hidden: !m.to.phone, value: m.to.phone, copy: m.to.phone },
              ]}
            />
          ) : (
            <Callout tone="warning" title="Sem contato de cobrança">
              Cadastre o contato de cobrança de {m.clientName} na ficha do cliente (aba Contatos) para saber para quem enviar.
            </Callout>
          )}
          {!m.hasInvoice && <Callout tone="info" title="Ainda sem NF emitida">A mensagem cita a cobrança sem número de nota. Emita a NF antes, se o cliente exige.</Callout>}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-subtle">Assunto</span>
              <CopyButton value={m.subject} label="Copiar assunto" size="xs" />
            </div>
            <p className="rounded-md border border-line bg-layer px-3 py-2 text-sm text-fg">
              <Copyable value={m.subject} label="Assunto">{m.subject}</Copyable>
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-subtle">Mensagem</span>
              <CopyButton value={m.body} label="Copiar mensagem" size="xs" successMessage="Mensagem de cobrança copiada" />
            </div>
            <p className="whitespace-pre-wrap rounded-md border border-line bg-layer px-3 py-2 text-sm text-fg">{m.body}</p>
          </div>
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <SelectField label="Canal usado" required value={channel} onChange={(v) => setChannel(v)} options={CHANNELS} error={error} />
            <TextField label="Observação" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: cliente prometeu pagar dia 15" />
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
