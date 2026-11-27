import type { Role } from "@/data/types";
import type { Resource } from "@/lib/permissions";

/** Descrição de cada perfil fixo (spec §3). */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Tudo, incluindo configurações, valores, aprovações e cofre.",
  gestao: "Comercial, Projetos e Administrativo; vê valores conforme definição financeira.",
  comercial: "Conduz propostas: Comercial, clientes e leitura de projetos e faturamento relacionados.",
  financeiro: "Financeiro completo e leitura de projetos e clientes.",
  operacao: "Equipe interna: projetos e tarefas em que atua, sem valores.",
  freelancer: "Só os projetos em que está alocado; sem valores de terceiros, propostas ou faturamento.",
};

export const INVITABLE_ROLES: Role[] = ["admin", "gestao", "comercial", "financeiro", "operacao", "freelancer"];

export const RESOURCE_LABEL: Record<Resource, string> = {
  settings: "Configurações",
  users: "Usuários",
  clients: "Clientes",
  freelancers: "Freelancers",
  freelancerBank: "Dados bancários de freelancers",
  projects: "Projetos",
  projectValues: "Valores de projetos",
  tasks: "Tarefas",
  receivables: "A receber",
  payables: "A pagar",
  files: "Arquivos",
  vault: "Cofre de credenciais",
  metrics: "Painel e métricas",
  commercial: "Comercial",
  adm: "Administrativo",
};

/** Aviso mostrado ao convidar ou mudar para um perfil com efeito colateral (RN-35/RN-37). */
export function roleChangeNote(role: Role, from?: Role): string | null {
  if (role === "freelancer" && from !== "freelancer") return "O perfil Freelancer fica ligado a um cadastro em Cadastros › Freelancers (aproveitamos o cadastro com o mesmo e-mail ou criamos um para o Financeiro completar os dados bancários).";
  if (from === "freelancer" && role !== "freelancer") return "A pessoa passa a ser da equipe interna. O cadastro de freelancer dela fica inativo, com o histórico de pagamentos mantido.";
  if (role === "admin" && from !== "admin") return "Administradores só entram com a verificação em duas etapas (2FA) cadastrada. Se a pessoa ainda não tem, o próximo login pede o cadastro.";
  return null;
}
