"use client";
/** "Mover para…": escolhe a pasta de destino numa árvore. Arquivos de projeto não se movem (regra no serviço). */
import { useState } from "react";
import { Button, Dialog, ErrorState, Skeleton } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { driveApi, PROJECTS_ROOT } from "@/data/services";
import { FolderTree } from "./folder-tree";

export function MoveFileDialog({ file, onClose }: { file: { id: string; name: string; folderId?: string | null } | null; onClose: () => void }) {
  const tree = useApiQuery(["drive", "tree"], () => driveApi.tree(), { staleTime: 30_000, enabled: !!file });
  const [dest, setDest] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const move = useApiMutation((v: { fileId: string; folderId: string }) => driveApi.moveFile(v.fileId, v.folderId), {
    success: "Arquivo movido",
    onSuccess: () => {
      setDest(null);
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const close = () => {
    setDest(null);
    setError(undefined);
    onClose();
  };
  const current = file?.folderId ?? null;
  const reveal: string[] = [];
  for (let id = current, guard = 0; id && guard < 10; guard++) {
    reveal.push(id);
    id = tree.data?.find((f) => f.id === id)?.parentId ?? null;
  }

  return (
    <Dialog
      open={!!file}
      onOpenChange={(o) => !o && !move.isPending && close()}
      title="Mover para…"
      description={file ? `Escolha a pasta de destino de "${file.name}".` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={move.isPending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon="folderMove"
            loading={move.isPending}
            onClick={() => {
              if (!dest) return setError("Escolha a pasta de destino");
              setError(undefined);
              move.mutate({ fileId: file!.id, folderId: dest });
            }}
          >
            Mover arquivo
          </Button>
        </>
      }
    >
      <div className="px-3 py-3">
        {tree.error ? (
          <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
        ) : !tree.data ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : (
          <FolderTree
            revealIds={reveal}
            folders={tree.data}
            activeId={dest}
            onSelect={(id) => {
              setDest(id);
              setError(undefined);
            }}
            disabledReason={(f) => (f.id === PROJECTS_ROOT ? "Arquivos de projeto ficam na pasta do projeto" : f.id === current ? "O arquivo já está nesta pasta" : undefined)}
          />
        )}
        {error && <p className="mt-3 text-xs text-danger" aria-live="polite">{error}</p>}
      </div>
    </Dialog>
  );
}
