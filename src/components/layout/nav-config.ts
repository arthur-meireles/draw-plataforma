/** Navegação fixa (seção 10.2) — filtrada pela matriz de permissões. */
import type { IconName } from "@/design/icons";
import type { Resource } from "@/lib/permissions";
import type { Role } from "@/data/types";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  resource?: Resource;
  /** Exige acesso total (T) ao recurso. */
  requireAll?: boolean;
  roles?: Role[];
  exact?: boolean;
  children?: NavItem[];
}

export const RAIL: NavItem[] = [
  { label: "Início", href: "/", icon: "home", exact: true },
  { label: "Projetos", href: "/projetos", icon: "projects", resource: "projects" },
  { label: "Painel", href: "/painel", icon: "dashboard", resource: "metrics" },
  { label: "Arquivos", href: "/arquivos", icon: "files", resource: "files" },
];

export const PERSONAL: NavItem[] = [
  { label: "Início", href: "/", icon: "home", exact: true },
  { label: "Caixa de entrada", href: "/caixa-de-entrada", icon: "inbox" },
  { label: "Minhas tarefas", href: "/minhas-tarefas", icon: "myTasks" },
];

export const MODULES: NavItem[] = [
  { label: "Comercial", href: "/comercial", icon: "commercial", resource: "commercial" },
  {
    label: "Projetos",
    href: "/projetos",
    icon: "project",
    resource: "projects",
    children: [
      { label: "Ativos", href: "/projetos", icon: "project", exact: true },
      { label: "Concluídos", href: "/projetos/concluidos", icon: "stageDone" },
    ],
  },
  {
    label: "Financeiro",
    href: "/financeiro",
    icon: "finance",
    resource: "receivables",
    children: [
      { label: "Visão geral", href: "/financeiro/visao-geral", icon: "chart", resource: "receivables", requireAll: true },
      { label: "A receber", href: "/financeiro/receber", icon: "receivable", resource: "receivables" },
      { label: "A pagar", href: "/financeiro/pagar", icon: "payable", resource: "payables" },
      { label: "Importar", href: "/financeiro/importar", icon: "upload", resource: "receivables", requireAll: true },
    ],
  },
  {
    label: "Administrativo",
    href: "/adm",
    icon: "adm",
    resource: "adm",
    children: [
      { label: "Tarefas", href: "/adm/tarefas", icon: "sprint" },
      { label: "Documentos", href: "/adm/documentos", icon: "document" },
      { label: "Cofre", href: "/adm/cofre", icon: "vault", resource: "vault" },
      { label: "Recursos", href: "/adm/recursos", icon: "resource" },
    ],
  },
];

export const REGISTRY: NavItem[] = [
  { label: "Clientes", href: "/clientes", icon: "clients", resource: "clients" },
  { label: "Freelancers", href: "/freelancers", icon: "freelancers", resource: "freelancers", roles: ["admin", "gestao", "comercial", "financeiro", "operacao"] },
];

export const SETTINGS: NavItem[] = [
  {
    label: "Configurações",
    href: "/configuracoes",
    icon: "settings",
    resource: "settings",
    children: [
      { label: "Usuários", href: "/configuracoes/usuarios", icon: "team" },
      { label: "Tipos de projeto", href: "/configuracoes/tipos-de-projeto", icon: "tag" },
      { label: "E-mail do sistema", href: "/configuracoes/email", icon: "email" },
      { label: "Preferências", href: "/configuracoes/preferencias", icon: "settings" },
    ],
  },
];

export const MOBILE_TABS: NavItem[] = [
  { label: "Início", href: "/", icon: "home", exact: true },
  { label: "Projetos", href: "/projetos", icon: "projects" },
  { label: "Tarefas", href: "/minhas-tarefas", icon: "myTasks" },
  { label: "Entrada", href: "/caixa-de-entrada", icon: "inbox" },
];

export function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
