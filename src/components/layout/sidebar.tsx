"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, BrandLogo, BrandSymbol, CountBadge, Button, DropdownMenu, Icon, IconButton, Kbd, Tooltip, type MenuItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useUnreadCount } from "@/data/hooks";
import { authApi } from "@/data/services";
import { ROLE_LABEL } from "@/data/reference";
import { usePwa } from "@/components/pwa/pwa-provider";
import { InstallAppButton } from "@/components/pwa/pwa-ui";
import { isActive, SECTIONS, sectionOf, type NavGroup, type NavItem, type NavSection } from "./nav-config";
import { usePermissions } from "./session";
import { useLayout } from "./layout-context";
import { ProfileSwitcherDialog } from "./profile-switcher";
import { isDemoMode } from "@/lib/demo";

/** "Trocar perfil" só existe no modo de demonstração (RN-33). */
const DEMO = isDemoMode();

/** Seções e itens visíveis para o perfil atual. */
export function useNav() {
  const perm = usePermissions();
  return useMemo(() => {
    const okItem = (i: NavItem) => (!i.resource || (i.requireAll ? perm.canWriteAll(i.resource) : perm.canRead(i.resource))) && (!i.roles || i.roles.includes(perm.role));
    return SECTIONS.map((s) => ({
      ...s,
      groups: s.groups
        .map((g) => ({ ...g, items: g.items.filter(okItem) }))
        .concat(s.key === "inicio" && perm.isFreelancer ? [{ title: "Você", items: [{ label: "Meus dados e pagamentos", href: `/freelancers/${perm.user.freelancerId}`, icon: "freelancer" as const }] }] : [])
        .filter((g) => g.items.length > 0),
    })).filter((s) => (!s.resource || (s.requireAll ? perm.canWriteAll(s.resource) : perm.canRead(s.resource))) && (!s.roles || s.roles.includes(perm.role)) && s.groups.length > 0);
  }, [perm]);
}

/** Destino ao clicar na seção: a própria entrada, ou o primeiro item permitido. */
const entryOf = (s: NavSection & { groups: NavGroup[] }) => (s.groups.some((g) => g.items.some((i) => i.href === s.href)) ? s.href : s.groups[0].items[0].href);

/* ───────── 1º nível: rail de seções ───────── */
export function Rail() {
  const pathname = usePathname();
  const sections = useNav();
  const current = sectionOf(pathname);
  const { sidebarCollapsed, toggleSidebar } = useLayout();
  const renderItem = (s: (typeof sections)[number]) => {
    const active = s.key === current;
    return (
      <Tooltip key={s.key} content={sidebarCollapsed ? s.label : s.description} side="right">
        <Link
          href={entryOf(s)}
          aria-label={s.label}
          aria-current={active ? "page" : undefined}
          className={cn("group relative flex w-14 flex-col items-center gap-1 rounded-lg py-1.5 transition-colors", active ? "text-rail-fg-active" : "text-rail-fg hover:text-rail-fg-active")}
        >
          {active && <span aria-hidden className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-full bg-accent-solid" />}
          <span className={cn("flex size-9 items-center justify-center rounded-lg transition-colors", active ? "bg-rail-active" : "group-hover:bg-rail-hover")}>
            <Icon name={s.icon} size="md" />
          </span>
          <span className={cn("max-w-full truncate text-[10px] leading-none", active ? "font-semibold" : "font-medium")}>{s.short}</span>
        </Link>
      </Tooltip>
    );
  };
  return (
    <nav aria-label="Seções" className="flex w-rail shrink-0 flex-col items-center gap-1.5 border-r border-rail-line bg-rail py-3 max-md:hidden">
      <Link href="/" aria-label="Draw — início" className="mb-2 flex size-10 items-center justify-center rounded-lg transition-transform hover:scale-105">
        <BrandSymbol className="h-8" />
      </Link>
      {sections.filter((s) => !s.bottom).map(renderItem)}
      <span className="flex-1" />
      {sections.filter((s) => s.bottom).map(renderItem)}
      <Tooltip content={sidebarCollapsed ? "Mostrar painel  [" : "Recolher painel  ["} side="right">
        <button type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Mostrar painel lateral" : "Recolher painel lateral"} aria-pressed={!sidebarCollapsed} className="flex size-9 items-center justify-center rounded-lg text-rail-fg hover:bg-rail-hover hover:text-rail-fg-active max-xl:hidden">
          <Icon name={sidebarCollapsed ? "panelRight" : "sidebar"} size="md" />
        </button>
      </Tooltip>
      <div className="xl:hidden">
        <UserMenu compact />
      </div>
    </nav>
  );
}

/* ───────── Itens do 2º nível ───────── */
function SideLink({ item, badge, onNavigate }: { item: NavItem; badge?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = isActive(pathname, item, search);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn("group flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors max-md:h-10", active ? "bg-layer-active font-medium text-fg" : "text-fg-muted hover:bg-layer-hover hover:text-fg")}
    >
      <Icon name={item.icon} size="sm" className={active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted"} />
      <span className="flex-1 truncate">{item.label}</span>
      <CountBadge count={badge} />
    </Link>
  );
}

function SideGroupBlock({ group, onNavigate, unread }: { group: NavGroup; onNavigate?: () => void; unread?: number }) {
  return (
    <div className="flex flex-col gap-px">
      {group.title && <p className="px-2 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-fg-placeholder">{group.title}</p>}
      {group.items.map((i) => (
        <SideLink key={i.href} item={i} onNavigate={onNavigate} badge={i.badge === "unread" ? unread : undefined} />
      ))}
    </div>
  );
}

/* ───────── Menu do usuário ───────── */
export function UserMenu({ compact }: { compact?: boolean }) {
  const { user } = usePermissions();
  const router = useRouter();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { clearUserCaches } = usePwa();
  const [switcher, setSwitcher] = useState(false);
  const items: MenuItem[] = [
    { label: "Preferências e notificações", icon: "notification", onSelect: () => router.push("/configuracoes/preferencias") },
    { label: theme === "dark" ? "Tema claro" : "Tema escuro", icon: theme === "dark" ? "themeLight" : "themeDark", onSelect: () => setTheme(theme === "dark" ? "light" : "dark"), separatorBefore: true },
    { label: "Usar tema do sistema", icon: "themeSystem", onSelect: () => setTheme("system"), hidden: theme === "system" },
    { label: "Trocar perfil (demonstração)", icon: "team", onSelect: () => setSwitcher(true), separatorBefore: true, hidden: !DEMO },
    {
      label: "Sair",
      icon: "logout",
      destructive: true,
      separatorBefore: true,
      onSelect: async () => {
        await authApi.logout();
        await clearUserCaches();
        qc.clear();
        router.replace("/login");
      },
    },
  ];
  return (
    <>
      <DropdownMenu
        align="start"
        label={user.email}
        items={items}
        trigger={
          <button type="button" className={cn("flex min-w-0 items-center gap-2 rounded-md p-1.5 text-left hover:bg-layer-hover", !compact && "w-full")} aria-label="Menu do usuário">
            <Avatar name={user.name} color={user.avatarColor} size="md" />
            {!compact && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
                <span className="block truncate text-2xs text-fg-subtle">{ROLE_LABEL[user.role]}</span>
              </span>
            )}
            {!compact && <Icon name="chevronsUpDown" size="sm" className="text-fg-subtle" />}
          </button>
        }
      />
      {DEMO && <ProfileSwitcherDialog open={switcher} onOpenChange={setSwitcher} />}
    </>
  );
}

/* ───────── 2º nível: painel da seção ───────── */
function SearchAndCreate({ onNavigate }: { onNavigate?: () => void }) {
  const perm = usePermissions();
  const { openCommand } = useLayout();
  return (
    <div className="flex flex-col gap-2 px-3 pb-2">
      <button type="button" onClick={() => { onNavigate?.(); openCommand(); }} className="flex h-8 items-center gap-2 rounded-md border border-line bg-layer-2 px-2 text-sm text-fg-placeholder hover:border-line-strong max-md:h-10">
        <Icon name="search" size="sm" />
        <span className="flex-1 text-left">Buscar</span>
        <span className="flex gap-0.5 max-md:hidden">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      {perm.canWriteAll("projects") && (
        <Button asChild variant="primary" size="md" className="w-full justify-start max-md:h-10">
          <Link href="/projetos/novo" onClick={onNavigate}>
            <Icon name="add" size="sm" />
            Novo projeto
          </Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Conteúdo do 2º nível.
 *  - `mode="section"` (desktop): só a seção ativa (definida pela URL).
 *  - `mode="all"` (gaveta do celular/tablet): todas as seções empilhadas.
 */
export function SidebarContent({ onNavigate, mode = "section" }: { onNavigate?: () => void; mode?: "section" | "all" }) {
  const pathname = usePathname();
  const sections = useNav();
  const unread = useUnreadCount();
  const { toggleSidebar } = useLayout();
  const current = sections.find((s) => s.key === sectionOf(pathname)) ?? sections[0];
  const shown = mode === "all" ? sections : [current];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-header shrink-0 items-center gap-2 px-3">
        {mode === "all" ? (
          <>
            <BrandLogo size="sm" className="mr-auto" />
          </>
        ) : (
          <>
            <Icon name={current.icon} size="md" className="text-accent" />
            <span className="flex-1 truncate font-display text-sm font-bold text-fg">{current.label}</span>
            <IconButton icon="sidebar" label="Recolher painel  [" size="sm" onClick={toggleSidebar} />
          </>
        )}
      </div>
      <SearchAndCreate onNavigate={onNavigate} />
      <nav aria-label="Navegação da seção" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
        {shown.map((s) => (
          <div key={s.key} className={cn("flex flex-col gap-1", mode === "all" && "border-t border-line pt-1 first:border-0")}>
            {mode === "all" && (
              <p className="flex items-center gap-1.5 px-2 pb-0.5 pt-2 font-display text-xs font-bold text-fg-muted">
                <Icon name={s.icon} size="xs" className="text-fg-subtle" />
                {s.label}
              </p>
            )}
            {s.groups.map((g, i) => (
              <SideGroupBlock key={`${s.key}-${i}`} group={g} onNavigate={onNavigate} unread={unread.data} />
            ))}
          </div>
        ))}
        {mode === "section" && <p className="mt-auto px-2 pt-4 text-2xs leading-relaxed text-fg-placeholder">{current.description}</p>}
      </nav>
      <div className="shrink-0 space-y-1 border-t border-line p-2 pb-safe">
        <InstallAppButton />
        <UserMenu />
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarCollapsed } = useLayout();
  return (
    <aside aria-hidden={sidebarCollapsed || undefined} className={cn("w-sidebar shrink-0 overflow-hidden border-r border-line bg-surface transition-[width,opacity] duration-200 max-xl:hidden", sidebarCollapsed && "w-0 border-r-0 opacity-0")}>
      <div className="h-full w-sidebar">
        <SidebarContent />
      </div>
    </aside>
  );
}
