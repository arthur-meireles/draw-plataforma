"use client";
import { useSyncExternalStore } from "react";

/** Assina uma media query (ex.: "(max-width: 767px)"). No servidor retorna `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Celular (< 768 px, faixa "mobile" da Lei 7). */
export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
