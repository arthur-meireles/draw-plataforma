"use client";
import { useEffect, useState } from "react";
import { Button, Section, TextareaField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { financeApi } from "@/data/services";
import type { ReceivableRow } from "./types";

/** Nota de cobrança do recebível (planilha: Status/Comentários Cobrança). Somente leitura sem permissão de escrita. */
export function CollectionNoteEditor({ row, writable }: { row: ReceivableRow; writable: boolean }) {
  const [text, setText] = useState(row.collectionNote ?? "");
  useEffect(() => setText(row.collectionNote ?? ""), [row.id, row.collectionNote]);
  const save = useApiMutation(() => financeApi.setCollectionNote(row.id, text), { success: "Nota de cobrança salva" });
  const dirty = text.trim() !== (row.collectionNote ?? "");

  return (
    <Section title="Cobrança" icon="comment" description="Registre o andamento da cobrança com o cliente.">
      {writable ? (
        <div className="space-y-2">
          <TextareaField aria-label="Nota de cobrança" rows={3} placeholder="Ex.: cliente pediu reenvio da NF; previsão de pagamento dia 15…" value={text} onChange={(e) => setText(e.target.value)} onSubmitShortcut={() => dirty && save.mutate(undefined)} />
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" loading={save.isPending} disabled={!dirty && !save.isPending} onClick={() => save.mutate(undefined)}>
              Salvar nota
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">{row.collectionNote ?? "Sem notas de cobrança."}</p>
      )}
    </Section>
  );
}
