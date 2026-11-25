"use client";
/**
 * Marca Draw the Law — arte OFICIAL (brandbook). Nunca redesenhar: use estes componentes.
 * - BrandSymbol: o "W" com a caneta (favicon, rail, splash).
 * - BrandLogo: assinatura completa "draw the LAW" (login, telas institucionais).
 * - BrandMark: o símbolo dentro de um ladrilho (avatar da organização, menus).
 * Formas sólidas/texto herdam `currentColor` → `text-navy` no claro e `text-white` no escuro.
 */
import { useId } from "react";
import { cn } from "@/lib/cn";
import { BRAND_LOGO, BRAND_SYMBOL } from "@/design/brand-art";

function Art({ art, className, title }: { art: { viewBox: string; body: string }; className?: string; title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      viewBox={art.viewBox}
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: art.body.replaceAll("__ID__", `b${uid}-`) }}
    />
  );
}

/** Símbolo oficial (W + caneta). Altura define o tamanho; cor sólida = currentColor. */
export function BrandSymbol({ className, title }: { className?: string; title?: string }) {
  return <Art art={BRAND_SYMBOL} title={title} className={cn("h-8 w-auto text-navy dark:text-white", className)} />;
}

const markSizes = { sm: "size-7 rounded-md p-1", md: "size-8 rounded-lg p-1", lg: "size-11 rounded-xl p-1.5" };

/** Símbolo em ladrilho (claro: superfície com borda; `inverted`: sobre fundos escuros da marca). */
export function BrandMark({ size = "md", className, inverted }: { size?: keyof typeof markSizes; className?: string; inverted?: boolean }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center", inverted ? "bg-white/10 ring-1 ring-white/15" : "bg-surface ring-1 ring-line dark:bg-white/5", markSizes[size], className)}>
      <BrandSymbol className={cn("h-full", inverted && "text-white")} />
    </span>
  );
}

const logoSizes = { sm: "h-8", md: "h-11", lg: "h-16", xl: "h-24" };

/** Logotipo oficial completo "draw the LAW". */
export function BrandLogo({ size = "md", className, inverted }: { size?: keyof typeof logoSizes; className?: string; inverted?: boolean }) {
  return <Art art={BRAND_LOGO} title="Draw the Law" className={cn("w-auto", logoSizes[size], inverted ? "text-white" : "text-navy dark:text-white", className)} />;
}
