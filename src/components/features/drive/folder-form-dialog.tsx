"use client";
/** Nova pasta / renomear pasta (nome único dentro da pasta-mãe; validações vêm do serviço). */
import { useEffect, useState } from "react";
import { Button, Dialog, TextField } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { driveApi } from "@/data/services";

export interface FolderFormTarget {
  /** Pasta a renomear; ausente = criar dentro de `parentId`. */
  folder?: { id: string; name: string } | null;
  parentId: string | null;
}

export function FolderFormDialog({ open, onOpenChange, target, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; target: FolderFormTarget; onCreated?: (id: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const renaming = !!target.folder;

  useEffect(() => {
    if (!open) return;
    setName(target.folder?.name ?? "");
    setError(undefined);
  }, [open, target.folder]);

  const save = useApiMutation(
    (n: string) => (target.folder ? driveApi.renameFolder(target.folder.id, n) : driveApi.createFolder(target.parentId, n)),
    {
      success: renaming ? "Pasta renomeada" : "Pasta criada",
      onSuccess: (f) => {
        onOpenChange(false);
        if (!renaming) onCreated?.(f.id);
      },
      onError: (e) => setError(e.fieldErrors?.name ?? e.message),
    },
  );

  const submit = () => {
    if (!name.trim()) {
      setError("Dê um nome à pasta");
      document.getElementById("drive-folder-name")?.focus();
      return;
    }
    setError(undefined);
    save.mutate(name);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={renaming ? "Renomear pasta" : "Nova pasta"}
      description={renaming ? undefined : "A pasta nova herda o acesso da pasta em que ela é criada."}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {renaming ? "Salvar nome" : "Criar pasta"}
          </Button>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField id="drive-folder-name" label="Nome da pasta" required autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(undefined); }} error={error} autoComplete="off" placeholder="Ex.: Contratos assinados" maxLength={80} />
      </form>
    </Dialog>
  );
}
