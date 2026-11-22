/** CSV no navegador: leitura tolerante (`;` `,` tab, aspas, BOM) e geração com BOM para o Excel abrir acentos. */

export type CsvTable = { headers: string[]; rows: Record<string, string>[] };

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

/** Lê um CSV completo. Cabeçalhos são normalizados (minúsculos, sem acento, `_`). */
export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, "");
  const delim = detectDelimiter(text);
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      records.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    records.push(row);
  }
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) =>
    h
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
  );
  const rows = nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows };
}

const escapeCell = (v: string, sep: string) => (v.includes('"') || v.includes("\n") || v.includes("\r") || v.includes(sep) ? `"${v.replace(/"/g, '""')}"` : v);

/** Gera CSV (`;`, CRLF) com BOM UTF-8. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][], sep = ";"): string {
  const lines = [headers, ...rows].map((r) => r.map((c) => escapeCell(c == null ? "" : String(c), sep)).join(sep));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type CsvCell = string | number | null | undefined;

/** Gera e baixa um CSV (BOM + `;`) a partir de cabeçalhos e linhas. */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  downloadTextFile(filename.endsWith(".csv") ? filename : `${filename}.csv`, toCsv(headers, rows));
}
