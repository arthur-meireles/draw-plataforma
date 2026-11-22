/**
 * Casca das telas públicas (login, recuperar senha, convite, formulário de NF).
 * Desktop (≥1024): painel de marca em marinho com os círculos no gradiente-assinatura (decorativo)
 * + formulário. Celular: só o formulário, com o monograma.
 */
import { BrandLogo, BrandMark } from "@/components/ui";
import { cn } from "@/lib/cn";

function BrandPanel() {
  return (
    <aside aria-hidden className="relative hidden overflow-hidden bg-navy p-10 text-white lg:flex lg:w-[42%] lg:flex-col lg:justify-between xl:p-14">
      <span className="absolute -right-24 -top-24 size-80 rounded-full bg-brand-gradient opacity-90" />
      <span className="absolute -bottom-40 -left-28 size-[26rem] rounded-full bg-brand-gradient opacity-25" />
      <span className="absolute bottom-24 right-16 size-16 rounded-full border-2 border-white/15" />
      <div className="relative flex items-center gap-3">
        <BrandMark size="lg" inverted />
        <span className="font-display text-lg font-extrabold tracking-tight">Draw the Law</span>
      </div>
      <div className="relative max-w-sm space-y-4">
        <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-white/60">Plataforma de gestão</p>
        <p className="font-display text-3xl font-bold leading-tight">Projetos, comercial e financeiro em um só lugar.</p>
        <p className="text-sm leading-relaxed text-white/70">Legal design com rastreio completo: do primeiro contato com o cliente até a nota fiscal do freelancer.</p>
      </div>
      <p className="relative text-xs text-white/40">Uso interno · Draw Legal Design</p>
    </aside>
  );
}

export function AuthLayout({ children, footer, width = "sm" }: { children: React.ReactNode; footer?: React.ReactNode; width?: "sm" | "lg" }) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <BrandPanel />
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4 py-10 pt-safe pb-safe">
        <BrandLogo size="lg" className="mb-6 lg:hidden" label="Draw the Law" />
        <div className={cn("w-full rounded-xl border border-line bg-surface p-6 shadow-raised-2 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none", width === "lg" ? "max-w-xl" : "max-w-sm")}>{children}</div>
        {footer && <div className="mt-6 text-center text-xs text-fg-subtle">{footer}</div>}
      </main>
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-5 space-y-1">
      <h1 className="font-display text-lg font-bold text-fg">{title}</h1>
      {description && <p className="text-sm text-fg-subtle">{description}</p>}
    </div>
  );
}
