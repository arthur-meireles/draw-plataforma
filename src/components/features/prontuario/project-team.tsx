"use client";
import { useState } from "react";
import { Avatar, Badge, Button, ConfirmDialog, DataTable, Dialog, MoneyField, RowActions, SelectField, type Column, type Option, Copyable } from "@/components/ui";
import { Money, usePeopleOptions } from "@/components/domain";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { projectsApi } from "@/data/services";
import { MEMBER_ROLE_LABEL } from "@/data/reference";
import type { MemberRole } from "@/data/types";
import { useProjectMembers, type ProjectDetail, type ProjectMemberRow } from "./use-project";

const roleOptions: Option<MemberRole>[] = (Object.keys(MEMBER_ROLE_LABEL) as MemberRole[]).map((r) => ({ value: r, label: MEMBER_ROLE_LABEL[r] }));

/** Adicionar pessoa ou editar função e valor combinado (apenas freelancers têm valor). */
function MemberDialog({ project, member, taken, onClose }: { project: ProjectDetail; member: ProjectMemberRow | null; taken: Set<string>; onClose: () => void }) {
  const { money } = usePermissions();
  const people = usePeopleOptions();
  const [person, setPerson] = useState<string | null>(null);
  const [role, setRole] = useState<MemberRole>(member?.memberRole ?? "apoio");
  const [amount, setAmount] = useState<number>(member?.agreedAmountCents ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isFreelancer = member ? member.kind === "freelancer" : person?.startsWith("freelancer:");

  const add = useApiMutation(
    () => {
      const [kind, ...rest] = (person ?? "").split(":");
      const id = rest.join(":");
      return projectsApi.addMember(project.id, { userId: kind === "user" ? id : null, freelancerId: kind === "freelancer" ? id : null, memberRole: role, agreedAmountCents: kind === "freelancer" && amount > 0 ? amount : null });
    },
    { success: "Pessoa adicionada à equipe", onSuccess: onClose },
  );
  const edit = useApiMutation(() => projectsApi.updateMember(member!.id, { memberRole: role, ...(member!.kind === "freelancer" && money ? { agreedAmountCents: amount > 0 ? amount : null } : {}) }), { success: "Equipe atualizada", onSuccess: onClose });
  const pending = add.isPending || edit.isPending;

  const submit = () => {
    if (member) return edit.mutate(undefined);
    if (!person) return setErrors({ person: "Escolha quem entra no projeto" });
    setErrors({});
    add.mutate(undefined);
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={member ? `Editar ${member.name}` : "Adicionar à equipe"}
      description={member ? undefined : "Pessoas da Draw e freelancers aparecem na mesma lista. Freelancers só enxergam os projetos em que estão alocados."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button variant="primary" loading={pending} onClick={submit}>{member ? "Salvar alterações" : "Adicionar à equipe"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {!member && <SelectField label="Pessoa" required options={people.options.filter((o) => !taken.has(o.value))} value={person} onChange={setPerson} placeholder={people.isLoading ? "Carregando pessoas…" : "Escolha uma pessoa"} searchPlaceholder="Buscar pessoa…" error={errors.person} />}
        <SelectField label="Função no projeto" options={roleOptions} value={role} onChange={(v) => v && setRole(v)} />
        {isFreelancer && money && <MoneyField label="Valor combinado" hint="Base da conta a pagar gerada ao concluir o projeto (RN-03). Deixe em branco se ainda não foi combinado." value={amount} onChange={setAmount} />}
      </div>
    </Dialog>
  );
}

/** Aba "Equipe": membros ativos com função, valor combinado e tarefas abertas. */
export function ProjectTeam({ project }: { project: ProjectDetail }) {
  const { canWriteAll, money } = usePermissions();
  const q = useProjectMembers(project.id);
  const [dialog, setDialog] = useState<{ member: ProjectMemberRow | null } | null>(null);
  const [removing, setRemoving] = useState<ProjectMemberRow | null>(null);
  const remove = useApiMutation((id: string) => projectsApi.removeMember(id), { success: "Pessoa removida da equipe", onSuccess: () => setRemoving(null) });
  const manage = canWriteAll("projects") && !["arquivado", "cancelado"].includes(project.status);
  const rows = q.data?.filter((m) => m.active);
  const taken = new Set((rows ?? []).map((m) => (m.userId ? `user:${m.userId}` : `freelancer:${m.freelancerId}`)));

  const columns: Column<ProjectMemberRow>[] = [
    {
      id: "name",
      header: "Pessoa",
      mobile: "title",
      sortValue: (m) => m.name,
      cell: (m) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={m.name} color={m.color} size="lg" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{m.name}</span>
            <Copyable value={m.email} label="E-mail" className="text-xs text-fg-subtle" />
          </span>
        </span>
      ),
    },
    { id: "kind", header: "Vínculo", mobile: "meta", sortValue: (m) => m.kind, cell: (m) => <Badge tone={m.kind === "interno" ? "accent" : "violet"}>{m.kind === "interno" ? "Interno" : "Freelancer"}</Badge> },
    { id: "role", header: "Função", mobile: "subtitle", sortValue: (m) => MEMBER_ROLE_LABEL[m.memberRole], cell: (m) => <span className="text-fg-muted">{MEMBER_ROLE_LABEL[m.memberRole]}</span> },
    ...(money ? [{ id: "amount", header: "Valor combinado", align: "right" as const, mobile: "meta" as const, sortValue: (m: ProjectMemberRow) => m.agreedAmountCents, cell: (m: ProjectMemberRow) => (m.kind === "freelancer" ? (m.agreedAmountCents ? <Money cents={m.agreedAmountCents} className="font-medium" /> : <span className="text-xs text-warning">A combinar</span>) : <span className="text-fg-placeholder">—</span>) }] : []),
    { id: "tasks", header: "Tarefas abertas", align: "right", mobile: "meta", sortValue: (m) => m.openTasks, cell: (m) => <span className="tabular-nums text-fg-muted">{m.openTasks}</span> },
    ...(manage ? [{ id: "actions", header: <span className="sr-only">Ações</span>, align: "right" as const, width: "48px", mobile: "trailing" as const, cell: (m: ProjectMemberRow) => <RowActions items={[{ label: "Editar função e valor", icon: "edit", onSelect: () => setDialog({ member: m }) }, { label: "Remover da equipe…", icon: "delete", destructive: true, onSelect: () => setRemoving(m) }]} /> }] : []),
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <p className="text-xs text-fg-subtle">{rows ? `${rows.length} ${rows.length === 1 ? "pessoa" : "pessoas"} no projeto` : ""}</p>
        {manage && <Button size="sm" variant="primary" icon="invite" onClick={() => setDialog({ member: null })}>Adicionar pessoa</Button>}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(m) => m.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        empty={{ icon: "team", title: "Ninguém na equipe", description: "Adicione quem vai trabalhar no projeto.", action: manage ? { label: "Adicionar pessoa", icon: "invite", onClick: () => setDialog({ member: null }) } : undefined }}
      />
      {dialog && <MemberDialog project={project} member={dialog.member} taken={taken} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remover ${removing?.name ?? ""} da equipe?`}
        description="A pessoa perde o acesso ao projeto, mas tarefas, comentários, arquivos e pagamentos já registrados são preservados (RN-08)."
        confirmLabel="Remover da equipe"
        destructive
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}
