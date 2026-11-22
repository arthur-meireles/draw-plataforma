/** Casca das telas públicas (login, recuperar senha, convite, formulário de NF). */
export function AuthLayout({ children, footer, width = "sm" }: { children: React.ReactNode; footer?: React.ReactNode; width?: "sm" | "lg" }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-10 pt-safe pb-safe">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-fg text-base font-bold text-surface">D</span>
        <span className="text-base font-semibold text-fg">Draw</span>
      </div>
      <div className={`w-full ${width === "lg" ? "max-w-xl" : "max-w-sm"} rounded-xl border border-line bg-surface p-6 shadow-raised-2 max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none`}>{children}</div>
      {footer && <div className="mt-6 text-center text-xs text-fg-subtle">{footer}</div>}
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-5 space-y-1">
      <h1 className="text-lg font-semibold text-fg">{title}</h1>
      {description && <p className="text-sm text-fg-subtle">{description}</p>}
    </div>
  );
}
