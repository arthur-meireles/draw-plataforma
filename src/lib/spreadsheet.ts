/**
 * Leitura de planilha no navegador (RF-M5-08): CSV pelo leitor próprio e XLSX/XLS pelo SheetJS, carregado sob demanda
 * (não pesa nas outras telas). Devolve linhas cruas em texto: datas viram "aaaa-mm-dd" e números ficam com ponto decimal.
 */
import { parseCsvRecords } from "./csv";

export interface SpreadsheetRead {
  records: string[][];
  sheetName: string | null;
  sheetNames: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const cellText = (v: unknown): string => {
  if (v == null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return String(v).trim();
};

export const isSpreadsheetFile = (name: string) => /\.(xlsx|xlsm|xls)$/i.test(name);

/**
 * @param preferSheet aba preferida (ex.: /projetos.*pagamentos/i); sem ela, a primeira aba.
 */
export async function readSpreadsheet(file: File, preferSheet?: RegExp): Promise<SpreadsheetRead> {
  if (!isSpreadsheetFile(file.name)) return { records: parseCsvRecords(await file.text()), sheetName: null, sheetNames: [] };
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true, dense: true });
  const name = (preferSheet && wb.SheetNames.find((n) => preferSheet.test(n.normalize("NFD").replace(/[̀-ͯ]/g, "")))) || wb.SheetNames[0];
  if (!name) return { records: [], sheetName: null, sheetNames: [] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false });
  return { records: rows.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== "")), sheetName: name, sheetNames: wb.SheetNames };
}
