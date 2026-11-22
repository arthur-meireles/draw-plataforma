"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, BrandMark, Button, DropdownMenu, Icon, Kbd, Tooltip, type MenuItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useUnreadCount } from "@/data/hooks";
import { authApi } from "@/data/services";
import { ROLE_LABEL } from "@/data/reference";
import { usePwa } from "@/components/pwa/pwa-provider";
import { InstallAppButton } from "@/components/pwa/pwa-ui";
import { isActive, MODULES, PERSONAL, RAIL, REGISTRY, SETTINGS, type NavItem } from "./nav-config";
import { usePermissions } from "./session";
import { useLayout } from "./layout-context";
import { ProfileSwitcherDialog } from "./profile-switcher";

function useVisible() {
  const perm = usePermissions();
  return (items: NavItem[]): NavItem[] =>
    items
      .filter((i) => (!i.resource || (i.requireAll ? perm.canWriteAll(i.resource) : perm.canRead(i.resource))) && (!i.roles || i.roles.includes(perm.role)))
      .map((i) => ({ ...i, children: i.children ? i.children.filter((c) => (!c.resource || (c.requireAll ? perm.canWriteAll(c.resource) : perm.canRead(c.resource))) && (!c.roles || c.roles.includes(perm.role))) : undefined }));
}

/* ───────── Rail (≥1280px) ───────── */
export function Rail() {
  const pathname = usePathname();
  const visible = useVisible();
  return (
    <nav aria-label="Atalhos" className="flex w-rail shrink-0 flex-col items-center gap-1 bg-navy py-3 max-xl:hidden">
      <Link href="/" aria-label="Draw — início" className="mb-3 rounded-lg">
        <BrandMark size="md" />
      </Link>
      {visible(RAIL).map((item) => {
        const active = item.href === "/projetos" ? pathname.startsWith("/projetos") || pathname.startsWith("/comercial") : isActive(pathname, item);
        return (
          <Tooltip key={item.href} content={item.label} side="right">
            <Link href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined} className={cn("flex size-9 items-center justify-center rounded-lg transition-colors", active ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white")}>
              <Icon name={item.icon} size="md" />
            </Link>
          </Tooltip>
        );
      })}
    </nav>
  );
}

/* ───────── Itens da sidebar ───────── */
function SideLink({ item, badge, onNavigate, depth = 0 }: { item: NavItem; badge?: number; onNavigate?: () => void; depth?: number }) {
  const pathname = usePathname();
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors max-md:h-10",
        depth > 0 && "h-7 pl-8 text-[13px] max-md:h-9",
        active ? "bg-layer-active font-medium text-fg" : "text-fg-muted hover:bg-layer-hover hover:text-fg",
      )}
    >
      {depth === 0 && <Icon name={item.icon} size="sm" className={active ? "text-fg" : "text-fg-subtle group-hover:text-fg-muted"} />}
      <span className="flex-1 truncate">{item.label}</span>
      {!!badge && <span className="rounded-full bg-accent-solid px-1.5 text-2xs font-semibold leading-4 text-accent-fg tabular-nums">{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}

function SideGroup({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const inside = pathname.startsWith(item.href) || item.children?.some((c) => isActive(pathname, c));
  const [open, setOpen] = useState(!!inside);
  useEffect(() => {
    if (inside) setOpen(true);
  }, [inside]);
  if (!item.children?.length) return <SideLink item={item} onNavigate={onNavigate} />;
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={cn("group flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors max-md:h-10", inside ? "text-fg" : "text-fg-muted hover:bg-layer-hover hover:text-fg")}>
        <Icon name={item.icon} size="sm" className="text-fg-subtle group-hover:text-fg-muted" />
        <span className="flex-1 truncate text-left">{item.label}</span>
        <Icon name="chevronRight" size="xs" className={cn("text-fg-placeholder transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="relative mt-px flex flex-col gap-px before:absolute before:bottom-1 before:left-[15px] before:top-1 before:w-px before:bg-line">
          {item.children.map((c) => (
            <SideLink key={c.href} item={c} depth={1} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function SideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-px">
      <p className="px-2 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-fg-placeholder">{title}</p>
      {children}
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
    { label: "Minha conta e e-mail", icon: "account", onSelect: () => router.push("/minha-conta/email"), hidden: user.role === "freelancer" },
    { label: "Preferências de notificação", icon: "notification", onSelect: () => router.push("/configuracoes/preferencias") },
    { label: theme === "dark" ? "Tema claro" : "Tema escuro", icon: theme === "dark" ? "themeLight" : "themeDark", onSelect: () => setTheme(theme === "dark" ? "light" : "dark"), separatorBefore: true },
    { label: "Usar tema do sistema", icon: "themeSystem", onSelect: () => setTheme("system"), hidden: theme === "system" },
    { label: "Trocar perfil (demonstração)", icon: "team", onSelect: () => setSwitcher(true), separatorBefore: true },
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
      <ProfileSwitcherDialog open={switcher} onOpenChange={setSwitcher} />
    </>
  );
}

/* ───────── Sidebar ───────── */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const visible = useVisible();
  const perm = usePermissions();
  const { openCommand } = useLayout();
  const unread = useUnreadCount();
  const modules = visible(MODULES);
  const registry = visible(REGISTRY);
  const settings = visible(SETTINGS);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-header shrink-0 items-center gap-2 px-3">
        <BrandMark size="sm" className="xl:hidden" />
        <span className="flex-1 truncate font-display text-sm font-bold text-fg">Draw the Law</span>
      </div>
      <div className="flex flex-col gap-2 px-3 pb-2">
        {perm.canWriteAll("projects") && (
          <Button asChild variant="primary" size="md" className="w-full justify-start max-md:h-10">
            <Link href="/projetos/novo" onClick={onNavigate}>
              <Icon name="add" size="sm" />
              Novo projeto
            </Link>
          </Button>
        )}
        <button type="button" onClick={() => { onNavigate?.(); openCommand(); }} className="flex h-8 items-center gap-2 rounded-md border border-line bg-layer-2 px-2 text-sm text-fg-placeholder hover:border-line-strong max-md:h-10">
          <Icon name="search" size="sm" />
          <span className="flex-1 text-left">Buscar</span>
          <span className="flex gap-0.5 max-md:hidden">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>
      <nav aria-label="Navegação principal" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
        <div className="flex flex-col gap-px">
          {PERSONAL.map((i) => (
            <SideLink key={i.href} item={i} onNavigate={onNavigate} badge={i.href === "/caixa-de-entrada" ? unread.data : undefined} />
          ))}
        </div>
        {modules.length > 0 && (
          <SideSection title="Módulos">
            {modules.map((m) => (
              <SideGroup key={m.href} item={m} onNavigate={onNavigate} />
            ))}
          </SideSection>
        )}
        {registry.length > 0 && (
          <SideSection title="Cadastros">
            {registry.map((m) => (
              <SideLink key={m.href} item={m} onNavigate={onNavigate} />
            ))}
          </SideSection>
        )}
        {perm.isFreelancer && (
          <SideSection title="Você">
            <SideLink item={{ label: "Meus dados e pagamentos", href: `/freelancers/${perm.user.freelancerId}`, icon: "freelancer" }} onNavigate={onNavigate} />
          </SideSection>
        )}
        {settings.length > 0 && (
          <SideSection title="Administração">
            {settings.map((m) => (
              <SideGroup key={m.href} item={m} onNavigate={onNavigate} />
            ))}
          </SideSection>
        )}
      </nav>
      <div className="shrink-0 space-y-1 border-t border-line p-2 pb-safe">
        <InstallAppButton />
        <UserMenu />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="w-sidebar shrink-0 border-r border-line bg-surface max-xl:hidden">
      <SidebarContent />
    </aside>
  );
}
