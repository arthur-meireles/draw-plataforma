"use client";
/**
 * Splash animada da marca (entrada após o login).
 * Uso: `showSplash()` em qualquer lugar (ex.: login bem-sucedido) — o `<SplashHost />` montado nos Providers
 * sobrevive à troca de rota e cobre a transição até a primeira tela carregar.
 * Sequência (~1,7s): o símbolo sobe com o "W" sendo revelado de baixo para cima, a caneta traça a linha
 * no gradiente oficial roxo→ciano, a assinatura "draw the LAW" é escrita da esquerda para a direita e a tela se dissolve.
 * Com `prefers-reduced-motion`, aparece estática e some rápido.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { BrandLogo } from "./brand";

const EVENT = "draw:splash";
const HOLD_MS = 1500;
const EXIT_MS = 380;

export function showSplash() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function SplashScreen({ leaving }: { leaving?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Entrando na plataforma Draw the Law"
      className={cn("fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-navy text-white", leaving ? "animate-splash-out" : "animate-fade-in")}
    >
      <span aria-hidden className="absolute inset-0 m-auto size-[36rem] rounded-full bg-brand-signature opacity-0 blur-3xl animate-splash-glow" />
      <div className="relative flex flex-col items-center gap-8">
        <div className="animate-splash-write">
          <BrandLogo size="xl" inverted className="h-28 sm:h-36" />
        </div>
        <span aria-hidden className="h-0.5 w-40 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full w-full origin-left rounded-full bg-brand-signature animate-splash-progress" />
        </span>
      </div>
    </div>
  );
}

export function SplashHost() {
  const [state, setState] = useState<"off" | "on" | "leaving">("off");
  useEffect(() => {
    const timers: number[] = [];
    const start = () => {
      timers.forEach(clearTimeout);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setState("on");
      timers.push(window.setTimeout(() => setState("leaving"), reduced ? 500 : HOLD_MS));
      timers.push(window.setTimeout(() => setState("off"), (reduced ? 500 : HOLD_MS) + EXIT_MS));
    };
    window.addEventListener(EVENT, start);
    return () => {
      window.removeEventListener(EVENT, start);
      timers.forEach(clearTimeout);
    };
  }, []);
  if (state === "off") return null;
  return <SplashScreen leaving={state === "leaving"} />;
}
