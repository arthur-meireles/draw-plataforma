/** Formatação e validação pt-BR. Datas em UTC no dado, exibidas em America/Sao_Paulo (P14). */
const TZ = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

export const money = (cents: number | null | undefined) => (cents == null ? "—" : brl.format(cents / 100));
export const moneyCompact = (cents: number | null | undefined) => (cents == null ? "—" : brlCompact.format(cents / 100));
export const percent = (v: number | null | undefined, digits = 0) =>
  v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
export const number = (v: number) => v.toLocaleString("pt-BR");

/** "1.234,56" | "1234,5" | "R$ 1.234" → centavos */
export function parseMoney(input: string): number {
  const clean = input.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const centsToInput = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function date(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, ...opts }).replace(".", "");
}
export const dateFull = (iso: string | null | undefined) => date(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
export const dateLong = (iso: string | null | undefined) => date(iso, { day: "numeric", month: "long", year: "numeric" });
export function dateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");
}

/** yyyy-mm-dd (para <input type="date">) a partir de ISO, no fuso de SP. */
export function toDateInput(iso: string | null | undefined) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return parts;
}
/** yyyy-mm-dd → ISO ao fim do expediente (20h UTC ≈ 17h SP). */
export const fromDateInput = (v: string) => (v ? new Date(`${v}T20:00:00.000Z`).toISOString() : null);

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
export function relative(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (abs < min) return "agora";
  if (abs < hour) return rtf.format(Math.round(diff / min), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day");
  return date(iso, { day: "2-digit", month: "short", year: "numeric" });
}

/** Dias inteiros entre hoje e a data (negativo = atrasado). */
export function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export type DueTone = "overdue" | "today" | "soon" | "normal" | "done";
export function dueTone(iso: string | null | undefined, done = false, soonDays = 2): DueTone {
  if (done) return "done";
  const d = daysUntil(iso);
  if (d == null) return "normal";
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= soonDays) return "soon";
  return "normal";
}
export function dueLabel(iso: string | null | undefined) {
  const d = daysUntil(iso);
  if (d == null) return "Sem prazo";
  if (d === 0) return "Hoje";
  if (d === 1) return "Amanhã";
  if (d === -1) return "Ontem";
  if (d < 0) return `${-d} dias atrasado`;
  if (d <= 6) return `Em ${d} dias`;
  return date(iso);
}

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

export function formatCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function isValidCnpj(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((a, w, i) => a + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export const plural = (n: number, one: string, many: string) => `${number(n)} ${n === 1 ? one : many}`;

/** Soma dias a uma data "aaaa-mm-dd" (valor de DateField) e devolve no mesmo formato. */
export function addDaysToDateInput(v: string, days: number) {
  if (!v) return "";
  const d = new Date(`${v}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
