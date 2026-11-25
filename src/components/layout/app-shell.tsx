"use client";
/**
 * Chassi da aplicação autenticada (10.6):
 *  ≥1280 rail (seções) + sidebar da seção (recolhível com "[") + conteúdo
 *  768–1279 rail + sidebar em gaveta · <768 barra inferior + gaveta com todas as seções.
 */
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useMe } from "@/data/hooks";
import { BrandSymbol } from "@/components/ui";
import { OfflineIndicator, UpdateBanner } from "@/components/pwa/pwa-ui";
import { LayoutContext } from "./layout-context";
import { SessionProvider } from "./session";
import { Rail, Sidebar } from "./sidebar";
import { BottomNav, MobileDrawer } from "./mobile-nav";
import { CommandPalette } from "./command-palette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [command, setCommand] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem("draw:pref:sidebar") === "recolhida");
    } catch {}
  }, []);
  const toggleSidebar = () =>
    setSidebarCollapsed((v) => {
      try {
        window.localStorage.setItem("draw:pref:sidebar", v ? "aberta" : "recolhida");
      } catch {}
      return !v;
    });

  useEffect(() => {
    if (me.isFetched && !me.data) router.replace(`/login${pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`);
  }, [me.isFetched, me.data, router, pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]");
      if (e.key === "[" && !typing && !e.metaKey && !e.ctrlKey) toggleSidebarRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleSidebarRef = useRef(toggleSidebar);
  toggleSidebarRef.current = toggleSidebar;

  useEffect(() => setDrawer(false), [pathname]);

  if (!me.data) {
    return (
      <div role="status" aria-label="Carregando" className="flex h-dvh items-center justify-center bg-canvas">
        <BrandSymbol className="h-12 animate-pulse" />
      </div>
    );
  }

  return (
    <SessionProvider user={me.data}>
      <LayoutContext.Provider value={{ openMobileNav: () => setDrawer(true), openCommand: () => setCommand(true), sidebarCollapsed, toggleSidebar }}>
        <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
          <OfflineIndicator />
          <div className="flex min-h-0 flex-1">
            <Rail />
            <Suspense fallback={<div className="w-sidebar shrink-0 border-r border-line bg-surface max-xl:hidden" />}>
              <Sidebar />
            </Suspense>
            <main id="conteudo" className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface xl:my-2 xl:mr-2 xl:rounded-lg xl:border xl:border-line">
              {children}
            </main>
          </div>
          <BottomNav onMore={() => setDrawer(true)} />
        </div>
        <Suspense fallback={null}>
          <MobileDrawer open={drawer} onOpenChange={setDrawer} />
        </Suspense>
        <CommandPalette open={command} onOpenChange={setCommand} />
        <UpdateBanner />
      </LayoutContext.Provider>
    </SessionProvider>
  );
}
