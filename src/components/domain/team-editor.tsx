"use client";
/** Editor de equipe do projeto: pessoas internas e freelancers, com papel e valor combinado (só freelancer). */
import { Button, IconButton, MoneyField, SelectField } from "@/components/ui";
import { MEMBER_ROLE_LABEL } from "@/data/reference";
import type { MemberRole } from "@/data/types";
import { cn } from "@/lib/cn";
import { PersonField, type PersonRef } from "./pickers";

export interface TeamRow {
  key: string;
  person: PersonRef | null;
  role: MemberRole;
  agreedAmountCents: number;
}

const newKey = () => `t-${Math.random().toString(36).slice(2, 9)}`;
export const emptyTeamRow = (): TeamRow => ({ key: newKey(), person: null, role: "designer", agreedAmountCents: 0 });

const roleOptions = (Object.keys(MEMBER_ROLE_LABEL) as MemberRole[]).filter((r) => r !== "responsavel").map((r) => ({ value: r, label: MEMBER_ROLE_LABEL[r] }));

export function TeamEditor({ value, onChange, errors = {}, showAmounts = true, className }: { value: TeamRow[]; onChange: (rows: TeamRow[]) => void; errors?: Record<string, string>; showAmounts?: boolean; className?: string }) {
  const patch = (key: string, p: Partial<TeamRow>) => onChange(value.map((r) => (r.key === key ? { ...r, ...p } : r)));
  return (
    <div className={cn("space-y-3", className)}>
      {value.length === 0 && <p className="rounded-md border border-dashed border-line-strong px-3 py-4 text-center text-xs text-fg-subtle">Só o responsável por enquanto. Adicione designers, roteiristas ou freelancers.</p>}
      <ul className="space-y-3">
        {value.map((r, i) => (
          <li key={r.key} className={cn("grid gap-3 rounded-lg border border-line bg-layer/50 p-3 md:items-start", showAmounts ? "md:grid-cols-[1fr_11rem_10rem_auto]" : "md:grid-cols-[1fr_11rem_auto]")}>
            <div data-field={`team.${i}.person`}><PersonField label="Pessoa" value={r.person} onChange={(p) => patch(r.key, { person: p, agreedAmountCents: p?.kind === "freelancer" ? r.agreedAmountCents : 0 })} error={errors[`team.${i}.person`]} /></div>
            <SelectField label="Papel" options={roleOptions} value={r.role} onChange={(v) => v && patch(r.key, { role: v })} />
            {showAmounts &&
              (r.person?.kind === "freelancer" ? (
                <MoneyField label="Valor combinado" value={r.agreedAmountCents} onChange={(c) => patch(r.key, { agreedAmountCents: c })} error={errors[`team.${i}.agreedAmountCents`]} hint="Gera a conta a pagar na conclusão." />
              ) : (
                <div className="hidden md:block" />
              ))}
            <div className="flex justify-end md:pt-[1.625rem]">
              <IconButton icon="delete" label={`Remover pessoa ${i + 1} da equipe`} variant="ghost" onClick={() => onChange(value.filter((x) => x.key !== r.key))} />
            </div>
          </li>
        ))}
      </ul>
      <Button size="sm" icon="add" onClick={() => onChange([...value, emptyTeamRow()])}>
        Adicionar pessoa
      </Button>
    </div>
  );
}
