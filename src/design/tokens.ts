/**
 * Espelho JS dos tokens de `src/app/globals.css`, para onde classes Tailwind não chegam
 * (Recharts, SVG, canvas). Sempre via `var(--…)` para respeitar o tema ativo.
 */
export const t = {
  color: {
    accent: "var(--accent)",
    accentSolid: "var(--accent-solid)",
    navy: "var(--navy)",
    orchid: "var(--orchid)",
    cyan: "var(--cyan)",
    magenta: "var(--magenta)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    info: "var(--info)",
    violet: "var(--violet)",
    fg: "var(--fg)",
    fgMuted: "var(--fg-muted)",
    fgSubtle: "var(--fg-subtle)",
    line: "var(--line)",
    surface: "var(--surface)",
    layer: "var(--layer)",
  },
  chart: {
    series: ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"],
    grid: "var(--chart-grid)",
    height: { sm: 180, md: 240, lg: 300 },
  },
  breakpoint: { sm: 640, md: 768, lg: 1024, xl: 1280 },
  font: { chartTick: 11 },
} as const;

/** Cores por categoria de etapa (StageCategory) — usadas nos ícones de etapa. */
export const stageCategoryColor = {
  open: "var(--fg-subtle)",
  waiting: "var(--warning)",
  done: "var(--success)",
  lost: "var(--danger)",
} as const;

export const priorityColor = {
  urgente: "var(--danger)",
  alta: "var(--orange)",
  media: "var(--warning)",
  baixa: "var(--info)",
} as const;
