/**
 * Módulo único de autorização (P7 / RF-M1-04). Espelha a matriz fixa da seção 9.
 * O back-end real terá a mesma matriz; o front apenas reflete (esconde ações).
 */
import type { Role, User } from "@/data/types";

export type Resource =
  | "settings"
  | "users"
  | "clients"
  | "freelancers"
  | "freelancerBank"
  | "projects"
  | "projectValues"
  | "tasks"
  | "receivables"
  | "payables"
  | "files"
  | "vault"
  | "metrics"
  | "commercial"
  | "adm"
  | "mail";

/** T total · L leitura · P próprios/alocados · — sem acesso */
export type Access = "T" | "L" | "P" | "-";

/**
 * [A VALIDAR] Acesso financeiro do perfil `gestao`. Enquanto a cliente não decide,
 * a gestão enxerga valores (pode ser desligado aqui sem tocar nas telas).
 */
export const GESTAO_FINANCE_ACCESS: Access = "T";

const MATRIX: Record<Resource, Record<Role, Access>> = {
  settings: { admin: "T", gestao: "L", comercial: "-", financeiro: "-", operacao: "-", freelancer: "-" },
  users: { admin: "T", gestao: "L", comercial: "-", financeiro: "-", operacao: "-", freelancer: "-" },
  clients: { admin: "T", gestao: "T", comercial: "T", financeiro: "L", operacao: "L", freelancer: "-" },
  freelancers: { admin: "T", gestao: "T", comercial: "L", financeiro: "T", operacao: "L", freelancer: "P" },
  freelancerBank: { admin: "T", gestao: GESTAO_FINANCE_ACCESS, comercial: "-", financeiro: "T", operacao: "-", freelancer: "P" },
  projects: { admin: "T", gestao: "T", comercial: "T", financeiro: "L", operacao: "P", freelancer: "P" },
  projectValues: { admin: "T", gestao: GESTAO_FINANCE_ACCESS, comercial: "T", financeiro: "T", operacao: "-", freelancer: "-" },
  tasks: { admin: "T", gestao: "T", comercial: "T", financeiro: "L", operacao: "P", freelancer: "P" },
  receivables: { admin: "T", gestao: GESTAO_FINANCE_ACCESS, comercial: "L", financeiro: "T", operacao: "-", freelancer: "-" },
  payables: { admin: "T", gestao: GESTAO_FINANCE_ACCESS, comercial: "-", financeiro: "T", operacao: "-", freelancer: "P" },
  files: { admin: "T", gestao: "T", comercial: "T", financeiro: "L", operacao: "P", freelancer: "P" },
  vault: { admin: "T", gestao: "P", comercial: "P", financeiro: "P", operacao: "P", freelancer: "-" },
  metrics: { admin: "T", gestao: "T", comercial: "P", financeiro: "P", operacao: "-", freelancer: "-" },
  commercial: { admin: "T", gestao: "T", comercial: "T", financeiro: "L", operacao: "-", freelancer: "-" },
  adm: { admin: "T", gestao: "T", comercial: "L", financeiro: "L", operacao: "L", freelancer: "-" },
  mail: { admin: "T", gestao: "T", comercial: "T", financeiro: "T", operacao: "T", freelancer: "-" },
};

export function access(user: Pick<User, "role"> | null | undefined, resource: Resource): Access {
  if (!user) return "-";
  return MATRIX[resource][user.role];
}

export const canRead = (user: Pick<User, "role"> | null | undefined, r: Resource) => access(user, r) !== "-";
export const canWrite = (user: Pick<User, "role"> | null | undefined, r: Resource) => {
  const a = access(user, r);
  return a === "T" || a === "P";
};
export const canWriteAll = (user: Pick<User, "role"> | null | undefined, r: Resource) => access(user, r) === "T";

/** RF-M1-05 — perfis sem permissão nunca recebem campos de valor. */
export const canSeeMoney = (user: Pick<User, "role"> | null | undefined) => access(user, "projectValues") === "T";

/** Perfis que só enxergam projetos onde estão alocados. */
export const isScopedToMembership = (user: Pick<User, "role"> | null | undefined) =>
  access(user, "projects") === "P";
