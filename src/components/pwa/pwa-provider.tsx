"use client";
/**
 * PWA (RF-X-04 / 10.6): registro do service worker, convite de instalação
 * (beforeinstallprompt no Chrome/Edge; ajuda manual no iOS), aviso de nova versão
 * e estado online/offline.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  canInstall: boolean;
  isStandalone: boolean;
  isIos: boolean;
  online: boolean;
  updateAvailable: boolean;
  install: () => Promise<boolean>;
  applyUpdate: () => void;
  /** Limpa caches do usuário (chamado no logout). */
  clearUserCaches: () => Promise<void>;
}

const PwaContext = createContext<PwaState>({
  canInstall: false,
  isStandalone: false,
  isIos: false,
  online: true,
  updateAvailable: false,
  install: async () => false,
  applyUpdate: () => {},
  clearUserCaches: async () => {},
});

export const usePwa = () => useContext(PwaContext);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const waiting = useRef<ServiceWorker | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setStandalone] = useState(false);
  const [isIos, setIos] = useState(false);
  const [online, setOnline] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    setIos(/iphone|ipad|ipod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document));
    const mq = window.matchMedia("(display-mode: standalone)");
    const update = () => setStandalone(mq.matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true);
    update();
    mq.addEventListener("change", update);
    setOnline(window.navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      deferred.current = null;
      setCanInstall(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Service worker: em produção, ou em dev com NEXT_PUBLIC_SW_DEV=1
    if ("serviceWorker" in navigator && (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_DEV === "1")) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          const track = (sw: ServiceWorker | null) => {
            if (!sw) return;
            sw.addEventListener("statechange", () => {
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                waiting.current = sw;
                setUpdateAvailable(true);
              }
            });
          };
          if (reg.waiting && navigator.serviceWorker.controller) {
            waiting.current = reg.waiting;
            setUpdateAvailable(true);
          }
          reg.addEventListener("updatefound", () => track(reg.installing));
          // verifica atualização a cada 30 min e ao voltar para a aba
          const check = () => reg.update().catch(() => {});
          const interval = window.setInterval(check, 30 * 60_000);
          document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
          return () => window.clearInterval(interval);
        })
        .catch(() => {});
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    }

    return () => {
      mq.removeEventListener("change", update);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const e = deferred.current;
    if (!e) return false;
    await e.prompt();
    const choice = await e.userChoice;
    deferred.current = null;
    setCanInstall(false);
    return choice.outcome === "accepted";
  }, []);

  const applyUpdate = useCallback(() => {
    waiting.current?.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const clearUserCaches = useCallback(async () => {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("draw-pages")).map((k) => caches.delete(k)));
  }, []);

  return <PwaContext.Provider value={{ canInstall, isStandalone, isIos, online, updateAvailable, install, applyUpdate, clearUserCaches }}>{children}</PwaContext.Provider>;
}
