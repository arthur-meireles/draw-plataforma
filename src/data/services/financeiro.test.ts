/** Financeiro (M5): CSV, importação e envio público de NF (RF-M5-04/08, RN-04). */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { financeApi, importsApi, publicInvoiceExtraApi } from "./index";
import { parseCsv, toCsv } from "@/lib/csv";
import { normalizeDate, normalizeMoney } from "@/components/features/financeiro/import-config";

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  setSessionUserId("usr_fernanda");
});

describe("CSV", () => {
  it("lê ; e , com aspas, BOM e normaliza cabeçalhos", () => {
    const t = parseCsv('﻿Razão Social;CNPJ\r\n"Silva; Filhos ""ME""";11.222.333/0001-81\r\n');
    expect(t.headers).toEqual(["razao_social", "cnpj"]);
    expect(t.rows[0].razao_social).toBe('Silva; Filhos "ME"');
    expect(parseCsv("a,b\n1,2").rows[0]).toEqual({ a: "1", b: "2" });
  });
  it("gera CSV com BOM UTF-8 e escapa separador", () => {
    const csv = toCsv(["a", "b"], [["x;y", 2]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"x;y";2');
  });
  it("normaliza data brasileira e moeda", () => {
    expect(normalizeDate("05/12/2026")).toBe("2026-12-05");
    expect(normalizeDate("31/02/2026")).toBeNull();
    expect(normalizeMoney("R$ 1.500,00")).toBe("1.500,00");
  });
});

describe("importação de recebíveis (RF-M5-08)", () => {
  it("valida em dry run e grava só as linhas válidas", async () => {
    const code = loadDb().projects.find((p) => !p.deletedAt)!.code;
    const rows = [
      { codigo_projeto: code, descricao: "Extra", valor: "1.500,00", vencimento: "2026-12-15" },
      { codigo_projeto: "ZZZ-999", descricao: "?", valor: "10,00", vencimento: "2026-12-15" },
    ];
    const report = await importsApi.preview("recebiveis", rows);
    expect(report.ok).toBe(1);
    expect(report.errors[0].line).toBe(3);
    const before = loadDb().receivables.length;
    await importsApi.commit("recebiveis", "r.csv", rows, report);
    expect(loadDb().receivables.length).toBe(before + 1);
  });
});

describe("formulário público de NF (RN-04)", () => {
  const pending = () => {
    const db = loadDb();
    const pay = db.payables.find((p) => p.status === "aguardando_nf" && p.kind === "freelancer")!;
    const req = db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id)!;
    const link = db.shareLinks.find((s) => s.id === req.shareLinkId)!;
    link.expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    window.localStorage.setItem("draw:db", JSON.stringify(db));
    return { pay, token: link.token };
  };
  const pdf = () => new File(["%PDF-1.4"], "nf.pdf", { type: "application/pdf" });

  it("rejeita arquivo que não é PDF", async () => {
    const { token } = pending();
    await expect(publicInvoiceExtraApi.submitWithFile(token, { legalName: "A", document: "1", pixKey: "x", invoiceNumber: "1", amountCents: 100, file: new File(["x"], "nf.png", { type: "image/png" }) })).rejects.toMatchObject({ status: 422 });
  });
  it("valor diferente do acordado vira divergente e aparece para o financeiro", async () => {
    const { pay, token } = pending();
    const res = await publicInvoiceExtraApi.submitWithFile(token, { legalName: "A", document: "123", pixKey: "x", invoiceNumber: "9", amountCents: pay.agreedAmountCents - 100, file: pdf() });
    expect(res.status).toBe("divergente");
    const row = (await financeApi.payables({ status: ["divergente"] })).find((p) => p.id === pay.id);
    expect(row?.divergenceNote).toBeTruthy();
  });
});
