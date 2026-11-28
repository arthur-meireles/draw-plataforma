"use client";
/** Busca global (RF-X-01) + comandos, estilo Power K do Plane. Atalho ⌘K / Ctrl+K. */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, Icon, Kbd, Spinner, type IconName } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { searchApi } from "@/data/services";
import { PROJECT_STATUS_LABEL, taskStatus } from "@/data/reference";
import { usePermissions } from "./session";

const itemCls = "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-fg-muted outline-none data-[selected=true]:bg-layer-hover data-[selected=true]:text-fg";
const groupCls = "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const perm = usePermissions();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 150);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const results = useApiQuery(["search", debounced], () => searchApi.query(debounced), { enabled: open && debounced.trim().length >= 2 });

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const actions: { label: string; icon: IconName; href: string; show: boolean }[] = [
    { label: "Novo projeto", icon: "add", href: "/projetos/novo", show: perm.canWriteAll("projects") },
    { label: "Minhas tarefas", icon: "myTasks", href: "/minhas-tarefas", show: true },
    { label: "Caixa de entrada", icon: "inbox", href: "/caixa-de-entrada", show: true },
    { label: "Funil comercial", icon: "commercial", href: "/comercial", show: perm.canRead("commercial") },
    { label: "Contas a receber", icon: "receivable", href: "/financeiro/receber", show: perm.canRead("receivables") },
    { label: "Contas a pagar", icon: "payable", href: "/financeiro/pagar", show: perm.canRead("payables") && !perm.isFreelancer },
    { label: "Meus pagamentos", icon: "payable", href: "/financeiro/pagar", show: perm.isFreelancer },
    { label: "Minha conta", icon: "user", href: "/minha-conta", show: true },
    { label: "Clientes", icon: "clients", href: "/clientes", show: perm.canRead("clients") },
    { label: "Arquivos", icon: "files", href: "/arquivos", show: perm.canRead("files") },
    { label: "Administrativo — tarefas por área", icon: "adm", href: "/adm/tarefas", show: perm.canRead("adm") },
    { label: "Administrativo — documentos", icon: "document", href: "/adm/documentos", show: perm.canRead("adm") },
    { label: "Preferências e notificações", icon: "settings", href: "/configuracoes/preferencias", show: true },
    { label: "Painel de indicadores", icon: "dashboard", href: "/painel", show: perm.canRead("metrics") },
  ];

  const r = results.data;
  const hasResults = r && (r.projects.length || r.clients.length || r.freelancers.length || r.tasks.length);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-backdrop animate-fade-in" />
        <DialogPrimitive.Content className="fixed inset-x-3 top-[12vh] z-[60] mx-auto max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-overlay outline-none animate-scale-in max-md:top-3">
          <DialogPrimitive.Title className="sr-only">Buscar</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Busque projetos, clientes, freelancers e tarefas</DialogPrimitive.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Icon name="search" size="md" className="text-fg-subtle" />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Buscar projetos, clientes, freelancers, tarefas…" className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-placeholder" />
              {results.isFetching && <Spinner />}
            </div>
            <Command.List className="max-h-[min(60vh,26rem)] overflow-y-auto p-1.5 scrollbar-thin">
              {debounced.trim().length < 2 ? (
                <Command.Group heading="Ir para" className={groupCls}>
                  {actions.filter((a) => a.show).map((a) => (
                    <Command.Item key={a.href} value={a.label} onSelect={() => go(a.href)} className={itemCls}>
                      <Icon name={a.icon} size="sm" className="text-fg-subtle" />
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : (
                <>
                  {!results.isFetching && !hasResults && <div className="px-3 py-10 text-center text-sm text-fg-subtle">Nada encontrado para &ldquo;{debounced}&rdquo;.</div>}
                  {!!r?.projects.length && (
                    <Command.Group heading="Projetos" className={groupCls}>
                      {r.projects.map((p) => (
                        <Command.Item key={p.id} value={`p-${p.id}`} onSelect={() => go(`/projetos/${p.code}`)} className={itemCls}>
                          <Icon name="project" size="sm" className="text-fg-subtle" />
                          <span className="w-16 shrink-0 font-mono text-xs text-fg-subtle">{p.code}</span>
                          <span className="min-w-0 flex-1 truncate">{p.title}</span>
                          <span className="shrink-0 text-xs text-fg-subtle max-sm:hidden">{PROJECT_STATUS_LABEL[p.status]}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {!!r?.clients.length && (
                    <Command.Group heading="Clientes" className={groupCls}>
                      {r.clients.map((c) => (
                        <Command.Item key={c.id} value={`c-${c.id}`} onSelect={() => go(`/clientes/${c.id}`)} className={itemCls}>
                          <Icon name="client" size="sm" className="text-fg-subtle" />
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-xs text-fg-subtle tabular-nums max-sm:hidden">{c.cnpj}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {!!r?.freelancers.length && (
                    <Command.Group heading="Freelancers" className={groupCls}>
                      {r.freelancers.map((f) => (
                        <Command.Item key={f.id} value={`f-${f.id}`} onSelect={() => go(`/freelancers/${f.id}`)} className={itemCls}>
                          <Avatar name={f.name} color={f.color} size="sm" />
                          <span className="flex-1 truncate">{f.name}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {!!r?.tasks.length && (
                    <Command.Group heading="Tarefas" className={groupCls}>
                      {r.tasks.map((t) => (
                        <Command.Item key={t.id} value={`t-${t.id}`} onSelect={() => go(t.projectCode ? `/projetos/${t.projectCode}?aba=tarefas&tarefa=${t.id}` : `/adm/tarefas?tarefa=${t.id}`)} className={itemCls}>
                          <Icon name="task" size="sm" className="text-fg-subtle" />
                          <span className="min-w-0 flex-1 truncate">{t.title}</span>
                          <span className="shrink-0 text-xs text-fg-subtle">{t.projectCode ?? "Administrativo"} · {taskStatus(t.statusKey).label}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-line bg-surface-2 px-4 py-2 text-2xs text-fg-subtle max-md:hidden">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> abrir</span>
              <span className="flex items-center gap-1"><Kbd>esc</Kbd> fechar</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
