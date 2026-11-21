"use client";
/**
 * Chassi da aplicação autenticada (10.6):
 *  ≥1280 rail + sidebar + conteúdo · 768–1279 sidebar em gaveta · <768 barra inferior.
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "@/data/hooks";
import { Spinner } from "@/components/ui";
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

  useEffect(() => {
    if (me.isFetched && !me.data) router.replace(`/login${pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`);
  }, [me.isFetched, me.data, router, pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  if (!me.data) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <SessionProvider user={me.data}>
      <LayoutContext.Provider value={{ openMobileNav: () => setDrawer(true), openCommand: () => setCommand(true) }}>
        <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
          <OfflineIndicator />
          <div className="flex min-h-0 flex-1">
            <Rail />
            <Sidebar />
            <main id="conteudo" className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface xl:my-2 xl:mr-2 xl:rounded-lg xl:border xl:border-line">
              {children}
            </main>
          </div>
          <BottomNav onMore={() => setDrawer(true)} />
        </div>
        <MobileDrawer open={drawer} onOpenChange={setDrawer} />
        <CommandPalette open={command} onOpenChange={setCommand} />
        <UpdateBanner />
      </LayoutContext.Provider>
    </SessionProvider>
  );
}
