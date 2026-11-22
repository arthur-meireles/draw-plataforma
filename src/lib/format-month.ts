/** "2026-11" → "novembro de 2026". */
export const monthTitle = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
};
