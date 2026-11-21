"use client";
/** Seletores de entidade reutilizáveis: pessoa (interna/freelancer), cliente, tipo de projeto, responsável em pill. */
import { useState } from "react";
import { Avatar, Combobox, MultiCombobox, Pill, SelectField, Icon, type Option } from "@/components/ui";
import { useAllPeople, useClientOptions, useInternalPeople, useProjectTypes } from "@/data/hooks";
import type { ID } from "@/data/types";
import { ProjectTypeIcon } from "./badges";
import { ClientFormDialog } from "./client-form";

export type PersonRef = { kind: "user" | "freelancer"; id: ID };
const encode = (p: PersonRef | null) => (p ? `${p.kind}:${p.id}` : null);
const decode = (v: string | null): PersonRef | null => (v ? { kind: v.split(":")[0] as PersonRef["kind"], id: v.split(":").slice(1).join(":") } : null);

/** Opções de pessoas; `scope` restringe a uma lista (ex.: equipe do projeto). */
export function usePeopleOptions(opts: { internalOnly?: boolean; restrictTo?: PersonRef[] } = {}) {
  const all = useAllPeople();
  const internal = useInternalPeople();
  const rows = opts.internalOnly ? (internal.data ?? []).map((u) => ({ kind: "user" as const, id: u.id, name: u.name, color: u.color, sub: "" })) : (all.data ?? []);
  const filtered = opts.restrictTo ? rows.filter((r) => opts.restrictTo!.some((x) => x.kind === r.kind && x.id === r.id)) : rows;
  const options: Option[] = filtered.map((p) => ({
    value: `${p.kind}:${p.id}`,
    label: p.name,
    description: p.sub || undefined,
    group: p.kind === "user" ? "Equipe Draw" : "Freelancers",
    leading: <Avatar name={p.name} color={p.color} size="sm" />,
  }));
  return { options, isLoading: all.isLoading || internal.isLoading, find: (ref: PersonRef | null) => (ref ? filtered.find((r) => r.kind === ref.kind && r.id === ref.id) : undefined) };
}

/** Seletor de pessoa com label (formulários). */
export function PersonField({ label, value, onChange, internalOnly, restrictTo, error, required, placeholder = "Escolha uma pessoa", clearable }: { label?: string; value: PersonRef | null; onChange: (v: PersonRef | null) => void; internalOnly?: boolean; restrictTo?: PersonRef[]; error?: string; required?: boolean; placeholder?: string; clearable?: boolean }) {
  const { options } = usePeopleOptions({ internalOnly, restrictTo });
  return <SelectField label={label} required={required} error={error} options={options} value={encode(value)} onChange={(v) => onChange(decode(v))} placeholder={placeholder} searchPlaceholder="Buscar pessoa…" clearable={clearable} />;
}

/** Pill de responsável (cartões, linhas de tarefa). Sem onChange, só exibe. */
export function AssigneePill({ value, name, color, onChange, restrictTo, size = "md", showName = false }: { value: PersonRef | null; name?: string | null; color?: string | null; onChange?: (v: PersonRef | null) => void; restrictTo?: PersonRef[]; size?: "sm" | "md"; showName?: boolean }) {
  const { options } = usePeopleOptions({ restrictTo });
  const pill = (
    <Pill size={size} static={!onChange} leading={name ? <Avatar name={name} color={color} size="xs" /> : <Icon name="user" size="xs" />} tone={name ? "default" : "muted"} aria-label={name ? `Responsável: ${name}` : "Sem responsável"} title={name ?? "Sem responsável"}>
      {showName ? (name ?? "Sem responsável") : undefined}
    </Pill>
  );
  if (!onChange) return pill;
  return <Combobox options={options} value={encode(value)} onChange={(v) => onChange(decode(v))} trigger={pill} contentClassName="w-64" clearable searchPlaceholder="Buscar pessoa…" />;
}

/** Seletor de cliente com "Cadastrar cliente" inline (RF-M3-02: cadastrar na hora se novo). */
export function ClientField({ value, onChange, error, required = true, label = "Cliente", allowCreate = true }: { value: ID | null; onChange: (id: ID | null) => void; error?: string; required?: boolean; label?: string; allowCreate?: boolean }) {
  const clients = useClientOptions();
  const [creating, setCreating] = useState(false);
  const options: Option[] = (clients.data ?? []).map((c) => ({ value: c.id, label: c.tradeName, description: `${c.legalName} · ${c.cnpj}`, keywords: [c.legalName, c.cnpj], icon: "client" }));
  return (
    <>
      <SelectField
        label={label}
        required={required}
        error={error}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={clients.isLoading ? "Carregando clientes…" : "Escolha o cliente"}
        searchPlaceholder="Buscar por nome ou CNPJ…"
        footerAction={allowCreate ? { label: "Cadastrar novo cliente", icon: "add", onSelect: () => setCreating(true) } : undefined}
      />
      {allowCreate && <ClientFormDialog open={creating} onOpenChange={setCreating} onSaved={(c) => onChange(c.id)} />}
    </>
  );
}

export function ProjectTypeField({ value, onChange, error, required = true, label = "Tipo de projeto" }: { value: ID | null; onChange: (id: ID | null) => void; error?: string; required?: boolean; label?: string }) {
  const types = useProjectTypes();
  const options: Option[] = (types.data ?? []).map((t) => ({ value: t.id, label: t.name, description: `Código ${t.codePrefix}-000`, leading: <ProjectTypeIcon icon={t.icon} size="xs" /> }));
  return <SelectField label={label} required={required} error={error} options={options} value={value} onChange={onChange} placeholder="Escolha o tipo" />;
}

/** Multi-seleção de pessoas (filtros). */
export function PeopleMultiSelect({ value, onChange, internalOnly, placeholder = "Pessoas" }: { value: string[]; onChange: (v: string[]) => void; internalOnly?: boolean; placeholder?: string }) {
  const { options } = usePeopleOptions({ internalOnly });
  return <MultiCombobox options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}
