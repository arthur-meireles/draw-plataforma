"use client";
import { useState } from "react";
import { Button, Icon, IconButton, Input } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { tasksApi } from "@/data/services";
import type { AdmArea } from "@/data/types";

/** Adição rápida no rodapé da coluna do quadro por área ("+ Nova tarefa" → título + Enter). */
export function AreaQuickAdd({ area }: { area: AdmArea }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const create = useApiMutation(tasksApi.create, { success: "Tarefa criada", onSuccess: () => setTitle("") });

  if (!open)
    return (
      <Button variant="ghost" size="sm" icon="add" onClick={() => setOpen(true)} className="justify-start text-fg-subtle">
        Nova tarefa
      </Button>
    );
  return (
    <form
      className="space-y-2 rounded-lg border border-line bg-surface p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) create.mutate({ module: "adm", projectId: null, area, title });
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon name="stageOpen" size="sm" className="shrink-0 text-fg-subtle" />
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título e Enter" aria-label="Título da nova tarefa" onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <IconButton icon="close" label="Cancelar" size="xs" onClick={() => setOpen(false)} />
        <Button type="submit" size="xs" variant="primary" loading={create.isPending}>
          Adicionar
        </Button>
      </div>
    </form>
  );
}
