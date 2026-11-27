/** Importação da planilha master — aba "Projetos & Pagamentos" (seção 20.3/20.6, RN-44, RF-M5-08). */
import { beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { importsApi, masterImportApi, parseMasterSheet, MASTER_TEMPLATE_HEADERS } from "./index";
import { mapPayableStatus, mapProjectStatus, parseDate, parseMoneyCents, stripClientPrefix } from "./importacao";
import { parseCsvRecords, toCsv } from "@/lib/csv";
import { readSpreadsheet } from "@/lib/spreadsheet";

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  setSessionUserId("usr_paula");
});

/** Fixture: título acima da tabela, cabeçalhos repetidos por papel, CNPJ com tabulação no fim, valores em texto. */
const row = (cells: Record<string, string>, roles: Record<string, string[]> = {}) => {
  const out = MASTER_TEMPLATE_HEADERS.map(() => "");
  const set = (header: string, value: string, occurrence = 0) => {
    let seen = -1;
    const idx = MASTER_TEMPLATE_HEADERS.findIndex((h) => h === header && ++seen === occurrence);
    out[idx] = value;
  };
  Object.entries(cells).forEach(([h, v]) => set(h, v));
  Object.entries(roles).forEach(([role, [name, valor, liberado, data, status]]) => {
    const start = MASTER_TEMPLATE_HEADERS.indexOf(role);
    [name, valor, liberado, data, status].forEach((v, i) => (out[start + i] = v ?? ""));
  });
  return out;
};

function fixture() {
  return [
    ["Planilha Master | Controle de Projetos | 2026"],
    MASTER_TEMPLATE_HEADERS,
    row(
      { ID: "P001", PROJETO: "Leroy - BMB", Cliente: "Leroy Merlin", "CNPJ Cliente": "11.222.333/0001-81\t", "Data Entrada": "10/03/2026", Tamanho: "Médio", "Tipo de Projeto": "Apresentação PPT", "Valor Total (R$)": "R$ 12.000,00", "Data Emissão NF": "15/04/2026", "Valor Pagto Parcela 1": "R$ 6.000,00", "Data Pagto Parcela 1": "05/05/2026", "Valor Pagto Parcela 2": "R$ 6.000,00", "Previsão Pagto Parcela 2": "15/05/2026", "Status Projeto": "Caso Finalizado", "Data Entrega": "30/04/2026", "Obs Política Pagto Cliente": "20 dias após emissão da NF", "Condição de Pagamento": "50/50", "Valor Cobrança Adicional": "R$ 500", "Status Cobrança Adicional": "A receber" },
      { Designer: ["Arthur Novo", "R$ 1.920", "SIM", "20/05/2026", "REALIZADO"], Advogado: ["Não teve"], Roteirista: ["Bruna Nova", "R$ 800", "NÃO", "", ""] },
    ),
    row({ ID: "P002", PROJETO: "Contrato visual X", Cliente: "Cliente Novo SA", "Tipo de Projeto": "Contrato visual", "Valor Total (R$)": "5000", "Status Projeto": "Caso Parado", "Condição de Pagamento": "À vista" }, { Designer: ["Arthur Novo", "R$ 700", "", "", ""] }),
    row({ ID: "P003", PROJETO: "Sem tipo", Cliente: "Leroy Merlin", "Tipo de Projeto": "Vídeo 3D", "Data Entrada": "31/02/2026" }),
  ];
}

describe("parser da planilha master", () => {
  it("normaliza valores, datas, status e prefixo do cliente", () => {
    expect(parseMoneyCents("R$ 1.920")).toBe(192_000);
    expect(parseMoneyCents("1920,5")).toBe(192_050);
    expect(parseMoneyCents("1920.5")).toBe(192_050);
    expect(parseMoneyCents("x")).toBeNull();
    expect(parseMoneyCents("abc")).toBeNaN();
    expect(parseDate("5/3/26")).toBe("2026-03-05");
    expect(parseDate("31/02/2026")).toBe("invalid");
    expect(mapProjectStatus("Caso Parado")).toMatchObject({ status: "ativo", paused: true });
    expect(mapProjectStatus("Caso Finalizado").status).toBe("concluido");
    expect(stripClientPrefix("Leroy - BMB", "Leroy Merlin")).toBe("BMB");
    expect(stripClientPrefix("Deck - Fase 2", "Leroy Merlin")).toBe("Deck - Fase 2");
    expect(mapPayableStatus({ role: "designer", name: "A", amountCents: 1, released: "", paidAt: null, payStatus: "x" }, true)).toBeNull();
  });

  it("acha o cabeçalho abaixo do título e separa os blocos de papel com colunas repetidas", () => {
    const { rows, headerError } = parseMasterSheet(fixture());
    expect(headerError).toBeNull();
    expect(rows).toHaveLength(3);
    const p1 = rows[0];
    expect(p1).toMatchObject({ line: 3, legacyCode: "P001", cnpj: "11.222.333/0001-81", totalCents: 1_200_000, enteredAt: "2026-03-10" });
    expect(p1.members.map((m) => [m.role, m.name, m.amountCents])).toEqual([
      ["designer", "Arthur Novo", 192_000],
      ["roteirista", "Bruna Nova", 80_000],
    ]);
    expect(p1.installments[0]).toMatchObject({ amountCents: 600_000, paidAt: "2026-05-05" });
    expect(rows[2].issues[0]).toContain("Data de entrada inválida");
    expect(parseMasterSheet([["a", "b"], ["1", "2"]]).headerError).toBeTruthy();
  });
});

describe("importação da planilha master (RN-44)", () => {
  it("dry run não grava e relata erro por linha", async () => {
    const before = loadDb().projects.length;
    const { rows } = parseMasterSheet(fixture());
    const report = await masterImportApi.preview(rows);
    expect(loadDb().projects.length).toBe(before);
    expect(report.ok).toBe(2);
    expect(report.lines.find((l) => l.legacyCode === "P003")!.action).toBe("erro");
    expect(report.errors.some((e) => e.line === 5 && e.message.includes("Tipo de projeto não cadastrado"))).toBe(true);
    expect(report.summary.projetos_criados).toBe(2);
  });

  it("grava clientes, projetos, equipe, recebíveis e pagáveis; reimportar não duplica", async () => {
    const { rows } = parseMasterSheet(fixture());
    const { job } = await masterImportApi.commit("master.csv", rows);
    expect(job.kind).toBe("planilha_master");
    let db = loadDb();
    const p1 = db.projects.find((p) => p.legacyCode === "P001")!;
    expect(p1).toMatchObject({ title: "BMB", status: "concluido", projectStageKey: "concluido", contractedAmountCents: 1_200_000, paymentCondition: "50_50", size: "medio" });
    expect(p1.code.startsWith("APR-")).toBe(true);
    const client = db.clients.find((c) => c.id === p1.clientId)!;
    expect(client).toMatchObject({ tradeName: "Leroy Merlin", paymentTermDays: 20 });
    const recs = db.receivables.filter((r) => r.projectId === p1.id);
    expect(recs.find((r) => r.description === "Parcela 1 (planilha)")).toMatchObject({ status: "recebido", taxCents: 36_000 });
    expect(recs.find((r) => r.description === "Parcela 2 (planilha)")!.status).toBe("faturado");
    expect(recs.find((r) => r.kind === "adicional")!.amountCents).toBe(50_000);
    const pays = db.payables.filter((x) => x.projectId === p1.id);
    expect(pays.map((x) => x.status).sort()).toEqual(["aguardando_nf", "pago"]);
    const arthur = db.freelancers.find((f) => f.name === "Arthur Novo")!;
    expect(db.projectMembers.filter((m) => m.freelancerId === arthur.id)).toHaveLength(2);
    const p2 = db.projects.find((p) => p.legacyCode === "P002")!;
    expect(p2.status).toBe("ativo");
    expect(p2.pausedAt).not.toBeNull();
    // ativo sem informação de pagamento: o pagável nasce na conclusão (RN-03)
    expect(db.payables.filter((x) => x.projectId === p2.id)).toHaveLength(0);

    const counts = () => ({ projects: loadDb().projects.length, recs: loadDb().receivables.length, pays: loadDb().payables.length, fls: loadDb().freelancers.length, clients: loadDb().clients.length, members: loadDb().projectMembers.length });
    const first = counts();
    const again = await masterImportApi.commit("master.csv", rows);
    expect(again.report.summary.projetos_atualizados).toBe(2);
    expect(counts()).toEqual(first);
    db = loadDb();
    expect(db.imports.filter((i) => i.kind === "planilha_master")).toHaveLength(2);
  });

  it("só Administrador e Gestão importam a planilha master", async () => {
    setSessionUserId("usr_fernanda");
    await expect(masterImportApi.preview(parseMasterSheet(fixture()).rows)).rejects.toMatchObject({ status: 403 });
  });

  it("tipos não suportados no assistente simples são recusados (não contam como importados)", async () => {
    await expect(importsApi.preview("planilha_master", [{ a: "1" }])).rejects.toMatchObject({ status: 422 });
    await expect(importsApi.commit("planilha_master", "x.csv", [{ a: "1" }], { total: 1, ok: 1, errors: [] })).rejects.toMatchObject({ status: 422 });
  });
});

describe("leitura de arquivo", () => {
  it("CSV exportado da aba vira as mesmas linhas", () => {
    const csv = toCsv(MASTER_TEMPLATE_HEADERS, fixture().slice(2));
    expect(parseMasterSheet(parseCsvRecords(csv)).rows.map((r) => r.legacyCode)).toEqual(["P001", "P002", "P003"]);
  });

  it("XLSX: escolhe a aba Projetos & Pagamentos e converte datas", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Resumo"]]), "Resumo Freelancers");
    const data: unknown[][] = fixture().slice(1);
    data[1][MASTER_TEMPLATE_HEADERS.indexOf("Data Entrada")] = new Date(2026, 2, 10);
    data[1][MASTER_TEMPLATE_HEADERS.indexOf("Valor Total (R$)")] = 12000;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data, { cellDates: true }), "Projetos & Pagamentos");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([buf], "master.xlsx");
    const read = await readSpreadsheet(file, /projetos.*pagamentos/i);
    expect(read.sheetName).toBe("Projetos & Pagamentos");
    const { rows } = parseMasterSheet(read.records);
    expect(rows[0]).toMatchObject({ legacyCode: "P001", enteredAt: "2026-03-10", totalCents: 1_200_000 });
  });
});
