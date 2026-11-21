"use client";
/** Navegação de celular (barra inferior) e gaveta lateral (celular "Mais" + tablet). */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useUnreadCount } from "@/data/hooks";
import { isActive, MOBILE_TABS } from "./nav-config";
import { SidebarContent } from "./sidebar";

export function MobileDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-backdrop animate-fade-in xl:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[min(20rem,86vw)] border-r border-line bg-surface shadow-overlay outline-none pt-safe animate-slide-in-left xl:hidden">
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Navegação da plataforma</DialogPrimitive.Description>
          <SidebarContent onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function BottomNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const unread = useUnreadCount();
  return (
    <nav aria-label="Navegação" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-safe md:hidden">
      <ul className="grid h-bottomnav grid-cols-5">
        {MOBILE_TABS.map((t) => {
          const active = isActive(pathname, t);
          const badge = t.href === "/caixa-de-entrada" ? unread.data : undefined;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-full flex-col items-center justify-center gap-0.5 text-2xs font-medium", active ? "text-accent" : "text-fg-subtle")}>
                <span className="relative">
                  <Icon name={t.icon} size="lg" />
                  {!!badge && <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">{badge > 9 ? "9+" : badge}</span>}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMore} className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-2xs font-medium text-fg-subtle">
            <Icon name="menu" size="lg" />
            Mais
          </button>
        </li>
      </ul>
    </nav>
  );
}
