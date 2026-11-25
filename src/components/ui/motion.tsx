"use client";
/**
 * Movimento (CLAUDE.md › Movimento): hooks e peças que dão vida discreta à interface.
 * Classes em `src/app/motion.css`. Tudo respeita `prefers-reduced-motion`.
 *
 * - useReducedMotion()   → true quando o usuário pede menos movimento
 * - useChangePulse(v)    → classe que "estala" (pop + anel) quando o valor muda (não no 1º render)
 * - useEntrance()        → entrada escalonada de itens de lista (só na montagem / itens novos)
 * - useSuccessFlash()    → dirige o estado `success` do Button após uma mutação
 * - CountUp / CountBadge → números que sobem até o valor; contador que pulsa ao aumentar
 * - PageTransition       → fade suave na troca de rota
 * - SuccessCheck         → ✓ que se desenha (usado pelo Button)
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/* ───────── Preferência do sistema ───────── */
const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getReduced = () => typeof window !== "undefined" && !!window.matchMedia?.(REDUCED).matches;

export function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, getReduced, () => false);
}

/* ───────── Pop ao mudar de valor ───────── */
/**
 * Retorna uma classe que reproduz um "pop" (escala .92→1 + anel de destaque que se dissolve) sempre que `value`
 * muda — nunca na montagem. Alterna duas classes equivalentes para reiniciar a animação sem remontar o elemento.
 */
export function useChangePulse(value: unknown) {
  const first = useRef(true);
  const prev = useRef(value);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (Object.is(prev.current, value)) return;
    prev.current = value;
    setCount((c) => c + 1);
  }, [value]);
  if (!count) return "";
  return count % 2 ? "motion-pop-a" : "motion-pop-b";
}

/* ───────── Entrada de listas ───────── */
const ENTER_CAP = 10;
const ENTER_WINDOW = 260 + ENTER_CAP * 30 + 100;
type EnterProps = { className?: string; style?: React.CSSProperties };
const NONE: EnterProps = {};

/**
 * Entrada escalonada (fade-up 6px, 30 ms entre itens, no máximo 10 escalonados) para linhas e cartões.
 * Anima só itens vistos pela primeira vez — refetch não reanima; item novo (criado) entra sozinho.
 * Uso: `const enter = useEntrance(); <li {...enter(id)}>` (mescle `className` se o item já tiver um).
 */
export function useEntrance() {
  const reduced = useReducedMotion();
  const seen = useRef(new Map<string, { i: number; t: number }>());
  const now = Date.now();
  let batch = 0;
  return (id: string): EnterProps => {
    if (reduced) return NONE;
    let entry = seen.current.get(id);
    if (!entry) {
      entry = { i: Math.min(batch++, ENTER_CAP), t: now };
      seen.current.set(id, entry);
    }
    if (now - entry.t > ENTER_WINDOW) return NONE;
    return { className: "motion-enter", style: { "--motion-i": entry.i } as React.CSSProperties };
  };
}

/* ───────── Sucesso após mutação ───────── */
/**
 * Dirige o `success` do Button: chame `flash()` no `onSuccess` da mutação. O botão mostra ✓ + rótulo de sucesso
 * por ~1,2 s e volta. `flash(after)` executa `after` (ex.: fechar o diálogo, navegar) depois de um instante para
 * que a confirmação seja vista (imediato com movimento reduzido).
 */
export function useSuccessFlash(duration = 1200) {
  const reduced = useReducedMotion();
  const [success, setSuccess] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const flash = useCallback(
    (after?: () => void, afterDelay = 650) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setSuccess(true);
      timers.current.push(setTimeout(() => setSuccess(false), duration));
      if (after) {
        if (reduced) after();
        else timers.current.push(setTimeout(after, afterDelay));
      }
    },
    [duration, reduced],
  );
  return { success, flash };
}

/** ✓ que se desenha (traço animado). Herda a cor do texto. */
export function SuccessCheck({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("motion-success-icon shrink-0", className)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
    </svg>
  );
}

/* ───────── Números ───────── */
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const defaultFormat = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));

/** Número que sobe do valor anterior (0 na montagem) até `value` em ~600 ms. */
export function CountUp({ value, format = defaultFormat, duration = 600, className }: { value: number; format?: (n: number) => string; duration?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);
  useEffect(() => {
    if (reduced) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    if (start === value) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const v = start + (value - start) * easeOutCubic(p);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);
  return (
    <span className={cn("tabular-nums", className)}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

/** Retorna classe de pulso único quando `count` aumenta (não na montagem nem ao diminuir). */
export function useIncreasePulse(count: number | null | undefined) {
  const prev = useRef(count);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (count != null && prev.current != null && count > prev.current) setN((x) => x + 1);
    prev.current = count;
  }, [count]);
  if (!n) return "";
  return n % 2 ? "motion-bump-a" : "motion-bump-b";
}

/** Contador (ex.: não lidas) que pulsa uma vez, suavemente, quando o número aumenta. */
export function CountBadge({ count, max = 99, className }: { count: number | null | undefined; max?: number; className?: string }) {
  const pulse = useIncreasePulse(count);
  if (!count) return null;
  return <span className={cn("inline-block rounded-full bg-accent-solid px-1.5 text-2xs font-semibold leading-4 text-accent-fg tabular-nums", pulse, className)}>{count > max ? `${max}+` : count}</span>;
}

/* ───────── Página ───────── */
/**
 * Envolve o conteúdo das rotas autenticadas: a cada troca de rota o conteúdo surge num fade curto
 * (só opacidade — não cria bloco de contenção para elementos `fixed`, como o Fab).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const cls = useChangePulse(pathname).replace("motion-pop", "motion-route");
  return <div className={cn("flex min-h-0 flex-1 flex-col", cls)}>{children}</div>;
}

/** Bloco que surge com fade + 4px ao montar (troque a `key` para reanimar, ex.: passo de assistente). */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("motion-page", className)}>{children}</div>;
}
