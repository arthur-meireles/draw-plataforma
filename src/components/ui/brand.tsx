/** Marca Draw: monograma marinho com o ponto no gradiente-assinatura (orquídea → violeta). */
import { cn } from "@/lib/cn";

const sizes = { sm: "size-6 rounded-md text-xs", md: "size-8 rounded-lg text-sm", lg: "size-10 rounded-xl text-base" };

export function BrandMark({ size = "md", className, inverted }: { size?: keyof typeof sizes; className?: string; inverted?: boolean }) {
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0 items-center justify-center font-display font-extrabold", inverted ? "bg-white text-navy" : "bg-navy text-white ring-1 ring-white/10", sizes[size], className)}>
      D
      <span className="absolute bottom-[18%] left-[22%] size-[18%] rounded-full bg-brand-gradient" />
    </span>
  );
}

/** Logotipo horizontal (monograma + nome). */
export function BrandLogo({ size = "md", className, label = "Draw" }: { size?: keyof typeof sizes; className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      <span className={cn("font-display font-extrabold tracking-tight text-fg", size === "lg" ? "text-lg" : "text-base")}>{label}</span>
    </span>
  );
}
