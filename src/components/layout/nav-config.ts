/**
 * Navegação em dois níveis (seção 10.2):
 *  - 1º nível (rail): SEÇÕES. Clicar abre a seção e troca o conteúdo do 2º nível.
 *  - 2º nível (sidebar): itens da seção ativa.
 * A seção ativa é derivada da URL (`sectionOf`) — rail e sidebar sempre concordam.
 * Tudo filtrado pela matriz de permissões.
 */
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
  /** Badge dinâmico (ex.: não lidas). */
  badge?: "unread";
  children?: NavItem[];
}

export interface NavGroup {
  title?: string;
  items: NavItem[];
}

export type SectionKey = "inicio" | "projetos" | "financeiro" | "adm" | "cadastros" | "painel" | "arquivos" | "configuracoes";

export interface NavSection {
  key: SectionKey;
  label: string;
  /** Rótulo curto exibido sob o ícone no rail. */
  short: string;
  icon: IconName;
  /** Página de entrada da seção. */
  href: string;
  /** Prefixos de rota que pertencem à seção. */
  match: string[];
  resource?: Resource;
  requireAll?: boolean;
  roles?: Role[];
  /** Fica no rodapé do rail. */
  bottom?: boolean;
  groups: NavGroup[];
  description: string;
}

const INTERNAL: Role[] = ["admin", "gestao", "comercial", "financeiro", "operacao"];

export const SECTIONS: NavSection[] = [
  {
    key: "inicio",
    label: "Início",
    short: "Início",
    icon: "home",
    href: "/",
    match: ["/", "/caixa-de-entrada", "/minhas-tarefas"],
    description: "Seu dia: tarefas, notificações e visão geral.",
    groups: [
      {
        items: [
          { label: "Início", href: "/", icon: "home", exact: true },
          { label: "Caixa de entrada", href: "/caixa-de-entrada", icon: "inbox", badge: "unread" },
          { label: "Minhas tarefas", href: "/minhas-tarefas", icon: "myTasks" },
        ],
      },
    ],
  },
  {
    key: "projetos",
    label: "Projetos",
    short: "Projetos",
    icon: "projects",
    href: "/projetos",
    match: ["/projetos", "/comercial"],
    resource: "projects",
    description: "Do funil comercial à entrega.",
    groups: [
      { title: "Comercial", items: [{ label: "Funil de cotações", href: "/comercial", icon: "commercial", resource: "commercial" }] },
      {
        title: "Execução",
        items: [
          { label: "Ativos", href: "/projetos", icon: "project", exact: true },
          { label: "Concluídos", href: "/projetos/concluidos", icon: "stageDone" },
        ],
      },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    short: "Financeiro",
    icon: "finance",
    href: "/financeiro/receber",
    match: ["/financeiro"],
    resource: "receivables",
    roles: ["admin", "gestao", "comercial", "financeiro", "freelancer"],
    description: "Contas a receber, a pagar e notas fiscais.",
    groups: [
      {
        items: [
          { label: "Visão geral", href: "/financeiro/visao-geral", icon: "chart", resource: "receivables", requireAll: true },
          { label: "A receber", href: "/financeiro/receber", icon: "receivable", resource: "receivables" },
          { label: "A pagar", href: "/financeiro/pagar", icon: "payable", resource: "payables" },
          { label: "Importar planilha", href: "/financeiro/importar", icon: "upload", resource: "receivables", requireAll: true },
        ],
      },
    ],
  },
  {
    key: "adm",
    label: "Administrativo",
    short: "Adm",
    icon: "adm",
    href: "/adm/tarefas",
    match: ["/adm"],
    resource: "adm",
    description: "Áreas internas, documentos, cofre e recursos.",
    groups: [
      {
        items: [
          { label: "Tarefas por área", href: "/adm/tarefas", icon: "sprint" },
          { label: "Documentos", href: "/adm/documentos", icon: "document" },
          { label: "Cofre", href: "/adm/cofre", icon: "vault", resource: "vault" },
          { label: "Recursos", href: "/adm/recursos", icon: "resource" },
        ],
      },
    ],
  },
  {
    key: "cadastros",
    label: "Cadastros",
    short: "Cadastros",
    icon: "registry",
    href: "/clientes",
    match: ["/clientes", "/freelancers"],
    resource: "clients",
    roles: INTERNAL,
    description: "Clientes, contatos e freelancers.",
    groups: [
      {
        items: [
          { label: "Clientes", href: "/clientes", icon: "clients", resource: "clients" },
          { label: "Freelancers", href: "/freelancers", icon: "freelancers", resource: "freelancers" },
        ],
      },
    ],
  },
  {
    key: "painel",
    label: "Painel",
    short: "Painel",
    icon: "dashboard",
    href: "/painel",
    match: ["/painel"],
    resource: "metrics",
    description: "Indicadores calculados dos projetos.",
    groups: [
      {
        items: [
          { label: "Visão geral", href: "/painel", icon: "dashboard", exact: true, roles: ["admin", "gestao"] },
          { label: "Comercial", href: "/painel?aba=comercial", icon: "commercial", roles: ["admin", "gestao", "comercial"] },
          { label: "Operação", href: "/painel?aba=operacao", icon: "project", roles: ["admin", "gestao"] },
          { label: "Financeiro", href: "/painel?aba=financeiro", icon: "finance", roles: ["admin", "gestao", "financeiro"] },
          { label: "Equipe", href: "/painel?aba=equipe", icon: "team", roles: ["admin", "gestao"] },
          { label: "Burndown", href: "/painel?aba=burndown", icon: "chart", roles: ["admin", "gestao"] },
        ],
      },
    ],
  },
  {
    key: "arquivos",
    label: "Arquivos",
    short: "Arquivos",
    icon: "files",
    href: "/arquivos",
    match: ["/arquivos"],
    resource: "files",
    description: "Drive com a estrutura de pastas da Draw.",
    // Itens dinâmicos (pastas-raiz) são montados na sidebar a partir do Drive.
    groups: [{ items: [{ label: "Todas as pastas", href: "/arquivos", icon: "files", exact: true }] }],
  },
  {
    key: "configuracoes",
    label: "Configurações",
    short: "Ajustes",
    icon: "settings",
    href: "/configuracoes/preferencias",
    match: ["/configuracoes", "/minha-conta"],
    bottom: true,
    description: "Sua conta, preferências e administração.",
    groups: [
      {
        title: "Você",
        items: [
          { label: "Preferências", href: "/configuracoes/preferencias", icon: "settings" },
        ],
      },
      {
        title: "Administração",
        items: [
          { label: "Usuários", href: "/configuracoes/usuarios", icon: "team", resource: "settings" },
          { label: "Tipos de projeto", href: "/configuracoes/tipos-de-projeto", icon: "tag", resource: "settings" },
          { label: "E-mail do sistema", href: "/configuracoes/email", icon: "email", resource: "settings" },
        ],
      },
    ],
  },
];

export const MOBILE_TABS: NavItem[] = [
  { label: "Início", href: "/", icon: "home", exact: true },
  { label: "Projetos", href: "/projetos", icon: "projects" },
  { label: "Tarefas", href: "/minhas-tarefas", icon: "myTasks" },
  { label: "Entrada", href: "/caixa-de-entrada", icon: "inbox" },
];

/** Seção a que a rota pertence (o prefixo mais longo vence; "/" só casa exato). */
export function sectionOf(pathname: string): SectionKey {
  let best: { key: SectionKey; len: number } = { key: "inicio", len: 0 };
  for (const s of SECTIONS) {
    for (const m of s.match) {
      const hit = m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`);
      if (hit && m.length > best.len) best = { key: s.key, len: m.length };
    }
  }
  return best.key;
}

/** Item ativo considera a query quando o link tem `?` (ex.: abas do painel). */
export function isActive(pathname: string, item: Pick<NavItem, "href" | "exact">, search?: URLSearchParams | null) {
  const [path, query] = item.href.split("?");
  if (query) {
    if (pathname !== path) return false;
    const want = new URLSearchParams(query);
    return [...want.entries()].every(([k, v]) => search?.get(k) === v);
  }
  if (item.exact) {
    if (pathname !== path) return false;
    // "/painel" e "/arquivos" exatos só ficam ativos sem aba/pasta escolhida
    if (path === "/painel") return !search?.get("aba");
    if (path === "/arquivos") return !search?.get("pasta");
    return true;
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
