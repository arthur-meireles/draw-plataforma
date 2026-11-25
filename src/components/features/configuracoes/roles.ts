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
