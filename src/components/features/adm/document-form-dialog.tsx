"use client";
import { useEffect, useState } from "react";
import { Button, DateField, Dialog, SelectField, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { admExtraApi } from "@/data/services";
import type { InstitutionalDocument } from "@/data/types";
import { focusFirstInvalid } from "@/lib/focus";
import { fromDateInput, toDateInput } from "@/lib/format";
import { documentCategoryOptions } from "./document-meta";
import { PdfUploadField } from "./pdf-upload-field";

export interface DocumentRow extends InstitutionalDocument {
  file: { id: string; name: string } | null;
}

/** Cadastro/edição de documento institucional, com PDF opcional (RF-M6-02). */
export function DocumentFormDialog({ open, onOpenChange, document: doc }: { open: boolean; onOpenChange: (o: boolean) => void; document: DocumentRow | null }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<InstitutionalDocument["category"]>("certidao");
  const [validUntil, setValidUntil] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setTitle(doc?.title ?? "");
    setCategory(doc?.category ?? "certidao");
    setValidUntil(toDateInput(doc?.validUntil));
    setFile(null);
    setErrors({});
  }, [open, doc]);

  const save = useApiMutation((v: Parameters<typeof admExtraApi.saveDocument>) => admExtraApi.saveDocument(...v), {
    success: doc ? "Documento atualizado" : "Documento cadastrado",
    onSuccess: () => onOpenChange(false),
    onError: (e) => {
      setErrors(e.fieldErrors ?? {});
      focusFirstInvalid();
    },
  });

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) {
      setErrors({ title: "Informe o título, ex.: Certidão negativa federal" });
      focusFirstInvalid();
      return;
    }
    save.mutate([{ title, category, validUntil: validUntil ? fromDateInput(validUntil) : null }, { id: doc?.id, file, currentFileId: doc?.fileId }]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={doc ? "Editar documento" : "Novo documento"}
      description="Documentos institucionais da Draw, com validade e alerta de vencimento."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => submit()}>
            {doc ? "Salvar alterações" : "Cadastrar documento"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Título" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Categoria" options={documentCategoryOptions} value={category} onChange={(v) => v && setCategory(v)} />
          <DateField label="Validade" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} hint="Deixe em branco se não vence." />
        </div>
        <PdfUploadField file={file} onChange={setFile} currentName={doc?.file?.name} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
