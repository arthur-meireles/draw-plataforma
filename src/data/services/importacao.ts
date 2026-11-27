/**
 * Importação da planilha master — aba "Projetos & Pagamentos" (seção 20.3, ordem da 20.6, RN-44).
 * `parseMasterSheet` é puro (linhas cruas → linhas normalizadas); `masterImportApi` faz o dry run e a gravação,
 * idempotente por `legacy_code`. Mesmas convenções de `_core`.
 */
import { CLIENT_LINK_DEFAULTS } from "../defaults";
import { baseFields, nowIso } from "../db";
import { FIRST_PROJECT_STAGE } from "../reference";
import type { Client, Database, Freelancer, ID, ImportJob, MemberRole, Payable, PaymentCondition, Project, ProjectMember, ProjectSize, Receivable, User } from "../types";
import { ApiError, emit, read, taxOf, touch, write } from "./_core";
import { freelancerDueDate } from "./payables-extra";
import { nextCode } from "./projects";
import { canWriteAll } from "@/lib/permissions";

/* ───────── parser (puro) ───────── */

export const normalizeHeader = (h: string) =>
  String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const norm = (v: string) => normalizeHeader(v).replace(/_/g, " ").trim();

/** "R$ 1.920,50" | "1920,5" | "1920.5" | "1.920" → centavos; vazio/"x" → null; inválido → NaN. */
export function parseMoneyCents(v: string | undefined): number | null {
  const s = String(v ?? "").trim();
  if (!s || /^(x|-|—|n\/?a|nao teve|não teve)$/i.test(s)) return null;
  let t = s.replace(/[R$\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** "05/12/2026" | "5/12/26" | "2026-12-05" | "2026-12-05T…" → "2026-12-05"; vazio → null; inválido → "invalid". */
export function parseDate(v: string | undefined): string | null | "invalid" {
  const s = String(v ?? "").trim();
  if (!s || /^(x|-|—)$/i.test(s)) return null;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const parts = br ? [br[3].length === 2 ? `20${br[3]}` : br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!parts) return "invalid";
  const [y, m, d] = parts.map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "invalid";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface MasterMember {
  role: MemberRole;
  name: string;
  amountCents: number | null;
  released: string;
  paidAt: string | null;
  payStatus: string;
}

export interface MasterRow {
  /** Linha na planilha (1 = cabeçalho da tabela). */
  line: number;
  legacyCode: string;
  title: string;
  clientName: string;
  cnpj: string;
  enteredAt: string | null;
  size: string;
  typeName: string;
  totalCents: number | null;
  issuedAt: string | null;
  installments: { n: number; expectedAt: string | null; paidAt: string | null; amountCents: number | null }[];
  projectStatus: string;
  deliveredAt: string | null;
  policyNote: string;
  collectionNote: string;
  condition: string;
  members: MasterMember[];
  additional: { amountCents: number; status: string; date: string | null } | null;
  /** Problemas de leitura da própria linha (data/valor inválido). */
  issues: string[];
}

const ROLE_HEADERS: { test: (h: string) => boolean; role: MemberRole }[] = [
  { test: (h) => h === "designer" || h === "designers", role: "designer" },
  { test: (h) => h === "advogado" || h === "advogada" || h === "advogados", role: "advogado" },
  { test: (h) => h === "roteirista" || h === "roteiristas", role: "roteirista" },
  { test: (h) => h.startsWith("outros_freelancer") || h === "outros" || h === "outro_freelancer", role: "apoio" },
];
const roleOf = (h: string) => ROLE_HEADERS.find((r) => r.test(h))?.role ?? null;

/** Colunas da tabela, achadas pelo cabeçalho normalizado (a planilha repete "Valor", "Data Pagto"… por papel). */
function locateColumns(headers: string[]) {
  const find = (pred: (h: string) => boolean) => headers.findIndex((h) => !!h && pred(h));
  const parcela = (n: number, prefix: string) => find((h) => h.startsWith(prefix) && h.includes("parcela") && h.endsWith(String(n)));
  const roles: { role: MemberRole; name: number; amount: number; released: number; paidAt: number; payStatus: number }[] = [];
  headers.forEach((h, i) => {
    const role = roleOf(h);
    if (!role) return;
    let end = headers.length;
    for (let j = i + 1; j < headers.length; j++) if (roleOf(headers[j]) || headers[j].startsWith("total_custo") || headers[j].startsWith("status_caso") || headers[j].startsWith("condicao")) { end = j; break; }
    const inBlock = (pred: (h: string) => boolean) => {
      for (let j = i + 1; j < end; j++) if (pred(headers[j])) return j;
      return -1;
    };
    roles.push({
      role,
      name: i,
      amount: inBlock((x) => x.startsWith("valor")),
      released: inBlock((x) => x.startsWith("liberado")),
      paidAt: inBlock((x) => x.startsWith("data_pag")),
      payStatus: inBlock((x) => x.startsWith("status_pag")),
    });
  });
  const firstRole = roles[0]?.name ?? headers.length;
  const before = (pred: (h: string) => boolean) => headers.findIndex((h, i) => i < firstRole && !!h && pred(h));
  return {
    legacy: find((h) => h === "id" || h === "id_projeto" || h === "codigo" || h === "legacy_code"),
    title: find((h) => h === "projeto" || h === "nome_do_projeto"),
    client: find((h) => h === "cliente"),
    cnpj: find((h) => h.includes("cnpj")),
    enteredAt: find((h) => h.startsWith("data_entrada") || h.startsWith("data_de_entrada")),
    size: find((h) => h === "tamanho" || h === "porte"),
    type: find((h) => h.startsWith("tipo_de_projeto") || h === "tipo_projeto" || h === "tipo"),
    total: find((h) => h.startsWith("valor_total")),
    issuedAt: find((h) => h.includes("emissao") && h.includes("nf")),
    installments: [1, 2].map((n) => ({ n, expectedAt: parcela(n, "previsao"), paidAt: parcela(n, "data"), amount: parcela(n, "valor") })),
    projectStatus: find((h) => h === "status_projeto" || h === "status_do_projeto" || h === "status_caso"),
    deliveredAt: find((h) => h.startsWith("data_entrega") || h.startsWith("data_de_entrega")),
    policy: find((h) => h.includes("politica")),
    collection: before((h) => h.includes("cobranca") && !h.includes("adicional")),
    condition: find((h) => h.startsWith("condicao")),
    addAmount: find((h) => h.startsWith("valor") && h.includes("adicional")),
    addStatus: find((h) => h.startsWith("status") && h.includes("adicional")),
    addDate: find((h) => h.startsWith("data") && h.includes("adicional")),
    roles,
  };
}

const EMPTY_NAMES = /^(nao teve|não teve|x|-|—|n\/?a|nenhum|sem)$/i;

/**
 * Lê a aba "Projetos & Pagamentos" a partir das linhas cruas (CSV ou XLSX já convertidos em texto).
 * Procura o cabeçalho nas 10 primeiras linhas (a planilha pode ter título acima da tabela).
 */
export function parseMasterSheet(records: string[][]): { rows: MasterRow[]; headerError: string | null } {
  const headerIdx = records.slice(0, 10).findIndex((r) => {
    const h = r.map(normalizeHeader);
    return h.includes("projeto") && h.includes("cliente");
  });
  if (headerIdx < 0) return { rows: [], headerError: 'Não achamos o cabeçalho da aba "Projetos & Pagamentos" (colunas ID, PROJETO e Cliente). Envie essa aba ou baixe o modelo.' };
  const headers = records[headerIdx].map(normalizeHeader);
  const c = locateColumns(headers);
  if (c.legacy < 0) return { rows: [], headerError: "Falta a coluna ID (ex.: P001), usada para não duplicar projetos ao importar de novo." };
  const rows: MasterRow[] = [];
  records.slice(headerIdx + 1).forEach((r, i) => {
    const cell = (idx: number) => (idx >= 0 ? String(r[idx] ?? "").trim() : "");
    if (!r.some((x) => String(x ?? "").trim())) return;
    if (!cell(c.legacy) && !cell(c.title)) return;
    const issues: string[] = [];
    const date = (idx: number, label: string) => {
      const d = parseDate(cell(idx));
      if (d === "invalid") {
        issues.push(`${label} inválida: ${cell(idx)} (use dd/mm/aaaa)`);
        return null;
      }
      return d;
    };
    const money = (idx: number, label: string) => {
      const m = parseMoneyCents(cell(idx));
      if (Number.isNaN(m)) {
        issues.push(`${label} inválido: ${cell(idx)}`);
        return null;
      }
      return m;
    };
    const members: MasterMember[] = c.roles
      .map((b) => ({ role: b.role, name: cell(b.name), amountCents: money(b.amount, `Valor do ${b.role === "apoio" ? "freelancer" : b.role}`), released: cell(b.released), paidAt: date(b.paidAt, "Data de pagamento do freelancer"), payStatus: cell(b.payStatus) }))
      .filter((m) => m.name && !EMPTY_NAMES.test(m.name));
    const addAmount = money(c.addAmount, "Valor da cobrança adicional");
    rows.push({
      line: headerIdx + i + 2,
      legacyCode: cell(c.legacy).toUpperCase(),
      title: cell(c.title),
      clientName: cell(c.client),
      cnpj: cell(c.cnpj).replace(/\s+/g, ""),
      enteredAt: date(c.enteredAt, "Data de entrada"),
      size: cell(c.size),
      typeName: cell(c.type),
      totalCents: money(c.total, "Valor total"),
      issuedAt: date(c.issuedAt, "Data de emissão da NF"),
      installments: c.installments.map((p) => ({ n: p.n, expectedAt: date(p.expectedAt, `Previsão da parcela ${p.n}`), paidAt: date(p.paidAt, `Data de pagamento da parcela ${p.n}`), amountCents: money(p.amount, `Valor da parcela ${p.n}`) })),
      projectStatus: cell(c.projectStatus),
      deliveredAt: date(c.deliveredAt, "Data de entrega"),
      policyNote: cell(c.policy),
      collectionNote: cell(c.collection),
      condition: cell(c.condition),
      members,
      additional: addAmount && addAmount > 0 ? { amountCents: addAmount, status: cell(c.addStatus), date: date(c.addDate, "Data da cobrança adicional") } : null,
      issues,
    });
  });
  return { rows, headerError: null };
}

/* ───────── mapeamentos da seção 20.1/20.3 ───────── */

export function mapProjectStatus(v: string): { status: "ativo" | "concluido" | "cancelado"; paused: boolean; known: boolean } {
  const s = norm(v);
  if (/finaliz|conclu|entregue/.test(s)) return { status: "concluido", paused: false, known: true };
  if (/parad|pausad/.test(s)) return { status: "ativo", paused: true, known: true };
  if (/cancel/.test(s)) return { status: "cancelado", paused: false, known: true };
  if (/inici|andamento|ativo/.test(s)) return { status: "ativo", paused: false, known: true };
  return { status: "ativo", paused: false, known: false };
}

export function mapCondition(v: string): PaymentCondition | null {
  const s = norm(v);
  if (!s) return null;
  if (/50\s*50/.test(s)) return "50_50";
  if (/vista/.test(s)) return "a_vista";
  if (/parcel/.test(s)) return "parcelado";
  return null;
}

export function mapSize(v: string): ProjectSize | null {
  const s = norm(v);
  if (s.startsWith("peq")) return "pequeno";
  if (s.startsWith("med")) return "medio";
  if (s.startsWith("gra")) return "grande";
  return null;
}

/** Freelancer: pagamento feito (REALIZADO/PAGO ou data), liberado (SIM) ou pendente; "x" = não se aplica. */
export function mapPayableStatus(m: MasterMember, projectDone: boolean): Payable["status"] | null {
  const st = norm(m.payStatus);
  if (st === "x" || st === "nao se aplica") return null;
  if (/realizad|pago/.test(st) || m.paidAt) return "pago";
  if (norm(m.released).startsWith("sim")) return "aprovado";
  return projectDone || norm(m.released).startsWith("nao") ? "aguardando_nf" : null;
}

/** "20 dias após emissão da NF" → 20. */
export const paymentTermDaysOf = (note: string) => {
  const m = note.match(/(\d{1,3})\s*dias?/i);
  return m ? Number(m[1]) : null;
};

/** "Leroy - BMB" com cliente "Leroy Merlin" → "BMB" (20.3: sem o prefixo do cliente). */
export function stripClientPrefix(title: string, clientName: string) {
  const parts = title.split(/\s+[-–—]\s+/);
  if (parts.length < 2) return title.trim();
  const prefix = norm(parts[0]);
  const client = norm(clientName);
  return prefix && client && (client.startsWith(prefix) || prefix.startsWith(client)) ? parts.slice(1).join(" - ").trim() : title.trim();
}

/* ───────── aplicação (dry run e gravação usam o mesmo código) ───────── */

export interface MasterLineReport {
  line: number;
  legacyCode: string;
  title: string;
  action: "criar" | "atualizar" | "erro";
  notes: string[];
  errors: string[];
}

export interface MasterReport {
  total: number;
  ok: number;
  errors: { line: number; message: string }[];
  lines: MasterLineReport[];
  summary: Record<string, number>;
}

const SUMMARY_KEYS = ["clientes_criados", "clientes_atualizados", "freelancers_criados", "projetos_criados", "projetos_atualizados", "membros", "recebiveis", "pagaveis", "cobrancas_adicionais"] as const;

const PAYABLE_RANK: Record<Payable["status"], number> = { aguardando_nf: 0, em_conferencia: 1, divergente: 1, aprovado: 2, pago: 3 };

const isoAt = (d: string | null, hour = 15) => (d ? `${d}T${String(hour).padStart(2, "0")}:00:00.000Z` : null);
const onlyDigits = (v: string) => v.replace(/\D/g, "");

function findType(db: Database, name: string) {
  const n = norm(name);
  if (!n) return null;
  const types = db.projectTypes.filter((t) => !t.deletedAt);
  return types.find((t) => norm(t.name) === n) ?? types.find((t) => norm(t.codePrefix) === n) ?? types.find((t) => n.startsWith(norm(t.name)) || norm(t.name).startsWith(n)) ?? null;
}

function applyMaster(db: Database, me: User, rows: MasterRow[]): MasterReport {
  const summary: Record<string, number> = Object.fromEntries(SUMMARY_KEYS.map((k) => [k, 0]));
  const lines: MasterLineReport[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const rep: MasterLineReport = { line: row.line, legacyCode: row.legacyCode, title: row.title, action: "criar", notes: [], errors: [...row.issues] };
    lines.push(rep);
    if (!row.legacyCode) rep.errors.push("ID vazio (ex.: P001)");
    else if (seen.has(row.legacyCode)) rep.errors.push(`ID ${row.legacyCode} repetido na planilha`);
    if (!row.title) rep.errors.push("Nome do projeto vazio");
    if (!row.clientName && !onlyDigits(row.cnpj)) rep.errors.push("Cliente vazio");
    const type = findType(db, row.typeName);
    if (!type) rep.errors.push(row.typeName ? `Tipo de projeto não cadastrado: ${row.typeName} (cadastre em Configurações › Tipos de projeto)` : "Tipo de projeto vazio");
    if (rep.errors.length) {
      rep.action = "erro";
      continue;
    }
    seen.add(row.legacyCode);

    /* 1. cliente — por CNPJ, senão pelo nome */
    const cnpj = onlyDigits(row.cnpj);
    let client: Client | undefined = (cnpj ? db.clients.find((c) => !c.deletedAt && onlyDigits(c.cnpj) === cnpj) : undefined) ?? db.clients.find((c) => !c.deletedAt && row.clientName && (norm(c.tradeName) === norm(row.clientName) || norm(c.legalName) === norm(row.clientName)));
    if (!client) {
      client = { ...baseFields(me.id), groupId: null, legalName: row.clientName || row.cnpj, tradeName: row.clientName || row.cnpj, cnpj: cnpj.length === 14 ? row.cnpj : "", address: { street: "", number: "", complement: null, district: "", city: "", state: "", zip: "" }, segment: "Outros", status: "ativo", notes: "Importado da planilha master", paymentTermsNote: null, paymentTermDays: null };
      db.clients.push(client);
      summary.clientes_criados++;
      rep.notes.push(`cria o cliente ${client.tradeName}${cnpj.length === 14 ? "" : " (sem CNPJ — complete o cadastro)"}`);
    } else if ((cnpj.length === 14 && !onlyDigits(client.cnpj)) || (row.policyNote && row.policyNote !== client.paymentTermsNote)) {
      summary.clientes_atualizados++;
      rep.notes.push(`atualiza o cliente ${client.tradeName}`);
    }
    if (cnpj.length === 14 && !onlyDigits(client.cnpj)) client.cnpj = row.cnpj;
    if (row.policyNote) {
      client.paymentTermsNote = row.policyNote;
      client.paymentTermDays = paymentTermDaysOf(row.policyNote) ?? client.paymentTermDays;
    }
    touch(client);

    /* 4. projeto — idempotente por legacy_code */
    const st = mapProjectStatus(row.projectStatus);
    if (!st.known) rep.notes.push(`status "${row.projectStatus || "vazio"}" não reconhecido: entra como ativo (revise)`);
    let p: Project | undefined = db.projects.find((x) => !x.deletedAt && x.legacyCode?.toUpperCase() === row.legacyCode);
    const enteredAt = isoAt(row.enteredAt, 12) ?? p?.enteredAt ?? nowIso();
    const completedAt = st.status === "concluido" ? (isoAt(row.deliveredAt) ?? p?.completedAt ?? nowIso()) : null;
    const fields = {
      clientId: client.id,
      title: stripClientPrefix(row.title, client.tradeName),
      status: st.status,
      projectStageKey: st.status === "concluido" ? ("concluido" as const) : st.status === "ativo" ? (p?.projectStageKey && p.projectStageKey !== "concluido" ? p.projectStageKey : FIRST_PROJECT_STAGE) : (p?.projectStageKey ?? null),
      enteredAt,
      startedAt: p?.startedAt ?? enteredAt,
      completedAt,
      contractedAmountCents: row.totalCents ?? p?.contractedAmountCents ?? null,
      size: mapSize(row.size) ?? p?.size ?? null,
      paymentCondition: mapCondition(row.condition) ?? p?.paymentCondition ?? null,
      pausedAt: st.paused ? (p?.pausedAt ?? nowIso()) : null,
      pausedReason: st.paused ? (p?.pausedReason ?? "Caso parado (planilha master)") : null,
    };
    if (p) {
      if (p.clientId !== client.id && db.receivables.some((r) => r.projectId === p!.id && r.issuedAt && !r.deletedAt && !r.description.endsWith("(planilha)"))) {
        rep.errors.push("O cliente mudou, mas o projeto já tem NF emitida no sistema (RN-12). Corrija na planilha ou no projeto");
        rep.action = "erro";
        continue;
      }
      Object.assign(p, fields);
      touch(p);
      rep.action = "atualizar";
      summary.projetos_atualizados++;
    } else {
      p = {
        ...baseFields(me.id),
        statusBeforeArchive: null,
        ...fields,
        projectTypeId: type!.id,
        code: nextCode(db, type!.codePrefix),
        briefing: null,
        origin: "direto",
        quoteStageKey: null,
        priorityKey: "media",
        position: -Date.now() / 1000,
        ownerId: me.id,
        billingContactId: db.clientContacts.find((c) => c.clientId === client!.id && c.isBillingContact)?.id ?? null,
        quoteSentAt: null,
        approvedAt: enteredAt,
        dueAt: null,
        estimatedEndAt: null,
        archivedAt: null,
        lostReason: null,
        isEnvironment: false,
        legacyCode: row.legacyCode,
      };
      db.projects.push(p);
      summary.projetos_criados++;
      if (!db.projectMembers.some((m) => m.projectId === p!.id && m.userId === me.id)) db.projectMembers.push({ ...baseFields(me.id), projectId: p.id, userId: me.id, freelancerId: null, memberRole: "responsavel", agreedAmountCents: null, active: true });
    }
    const project = p;
    const done = project.status === "concluido";

    /* 6. recebíveis — parcelas (idempotente pela descrição "Parcela n (planilha)") */
    let parcels = row.installments.filter((i) => (i.amountCents ?? 0) > 0);
    if (!parcels.length && (row.totalCents ?? 0) > 0) {
      const total = row.totalCents!;
      const half = Math.round(total / 2);
      parcels = mapCondition(row.condition) === "50_50" ? [{ n: 1, expectedAt: row.installments[0]?.expectedAt ?? null, paidAt: row.installments[0]?.paidAt ?? null, amountCents: half }, { n: 2, expectedAt: row.installments[1]?.expectedAt ?? null, paidAt: row.installments[1]?.paidAt ?? null, amountCents: total - half }] : [{ n: 1, expectedAt: row.installments[0]?.expectedAt ?? null, paidAt: row.installments[0]?.paidAt ?? null, amountCents: total }];
    }
    const sum = parcels.reduce((a, i) => a + (i.amountCents ?? 0), 0);
    if (row.totalCents && sum && sum !== row.totalCents) rep.notes.push("a soma das parcelas difere do valor total (revise)");
    const recIds: ID[] = [];
    for (const parc of parcels) {
      const description = `Parcela ${parc.n} (planilha)`;
      const status: Receivable["status"] = parc.paidAt ? "recebido" : row.issuedAt ? "faturado" : "previsto";
      const issuedAt = isoAt(row.issuedAt) ?? (parc.paidAt ? isoAt(parc.paidAt) : null);
      const data = { amountCents: parc.amountCents!, taxCents: taxOf(db, parc.amountCents!), expectedAt: isoAt(parc.expectedAt) ?? isoAt(parc.paidAt) ?? new Date(new Date(enteredAt).getTime() + 30 * 86_400_000).toISOString(), issuedAt, receivedAt: isoAt(parc.paidAt), status };
      const existing = db.receivables.find((r) => r.projectId === project.id && !r.deletedAt && r.description === description);
      if (existing) {
        if (existing.status !== "cancelado") Object.assign(existing, data, { clientId: client.id });
        touch(existing);
        recIds.push(existing.id);
      } else {
        const r: Receivable = { ...baseFields(me.id), projectId: project.id, clientId: client.id, proposalInstallmentId: null, description, invoiceNumber: null, invoiceFileId: null, kind: "parcela", collectionNote: null, ...data };
        db.receivables.push(r);
        recIds.push(r.id);
      }
      summary.recebiveis++;
    }
    if (row.collectionNote) {
      const target = db.receivables.find((r) => recIds.includes(r.id) && r.status !== "recebido") ?? db.receivables.find((r) => r.id === recIds[0]);
      if (target) target.collectionNote = row.collectionNote;
    }

    /* cobrança adicional (RN-14) */
    if (row.additional) {
      const description = "Cobrança adicional (planilha)";
      const s = norm(row.additional.status);
      const paid = /pago|recebid/.test(s);
      const data = { amountCents: row.additional.amountCents, taxCents: taxOf(db, row.additional.amountCents), expectedAt: isoAt(row.additional.date) ?? nowIso(), status: (paid ? "recebido" : /fatur|emitid/.test(s) ? "faturado" : "previsto") as Receivable["status"], receivedAt: paid ? (isoAt(row.additional.date) ?? nowIso()) : null, issuedAt: paid || /fatur|emitid/.test(s) ? (isoAt(row.additional.date) ?? nowIso()) : null };
      const existing = db.receivables.find((r) => r.projectId === project.id && !r.deletedAt && r.kind === "adicional" && r.description === description);
      if (existing) Object.assign(existing, data);
      else db.receivables.push({ ...baseFields(me.id), projectId: project.id, clientId: client.id, proposalInstallmentId: null, description, invoiceNumber: null, invoiceFileId: null, kind: "adicional", collectionNote: null, ...data });
      summary.cobrancas_adicionais++;
    }

    /* 2/5/7. freelancers, membros e pagáveis */
    for (const m of row.members) {
      let fl: Freelancer | undefined = db.freelancers.find((f) => !f.deletedAt && norm(f.name) === norm(m.name)) ?? db.freelancers.find((f) => !f.deletedAt && norm(f.name).split(" ")[0] === norm(m.name) && !norm(m.name).includes(" "));
      if (!fl) {
        fl = { ...baseFields(me.id), userId: null, name: m.name, email: "", phone: null, legalName: null, document: null, pixKey: null, bankName: null, bankAgency: null, bankAccount: null, jobTitle: null, specialties: [m.role === "designer" ? "design" : m.role === "roteirista" ? "roteiro" : m.role === "advogado" ? "juridico" : "outro"], status: "ativo", notes: "Importado da planilha master — complete e-mail e dados de pagamento", avatarColor: "#0891b2" };
        db.freelancers.push(fl);
        summary.freelancers_criados++;
        rep.notes.push(`cria o freelancer ${m.name} (sem e-mail — complete o cadastro)`);
      }
      const freelancer = fl;
      let member: ProjectMember | undefined = db.projectMembers.find((x) => x.projectId === project.id && x.freelancerId === freelancer.id && !x.deletedAt);
      if (member) Object.assign(member, { memberRole: m.role, agreedAmountCents: m.amountCents ?? member.agreedAmountCents, active: true });
      else {
        member = { ...baseFields(me.id), projectId: project.id, userId: null, freelancerId: freelancer.id, memberRole: m.role, agreedAmountCents: m.amountCents, active: true };
        db.projectMembers.push(member);
      }
      summary.membros++;
      const status = mapPayableStatus(m, done);
      const amount = member.agreedAmountCents ?? 0;
      if (!status || amount <= 0) continue;
      const due = isoAt(m.paidAt) ?? freelancerDueDate(db, completedAt ? new Date(completedAt) : new Date());
      const existing = db.payables.find((x) => x.projectMemberId === member!.id && !x.deletedAt);
      if (existing) {
        // reimportar só avança o status (nunca desfaz conferência/aprovação feita no sistema)
        const next = PAYABLE_RANK[status] > PAYABLE_RANK[existing.status] ? status : existing.status;
        if (existing.status === "aguardando_nf" || existing.status === "aprovado") existing.agreedAmountCents = amount;
        Object.assign(existing, { status: next, paidAt: next === "pago" ? (existing.paidAt ?? isoAt(m.paidAt) ?? due) : existing.paidAt });
        touch(existing);
      } else {
        const pay: Payable = { ...baseFields(me.id), projectId: project.id, kind: "freelancer", freelancerId: freelancer.id, projectMemberId: member.id, description: `${m.role === "designer" ? "Design" : m.role === "advogado" ? "Revisão jurídica" : m.role === "roteirista" ? "Roteiro" : "Serviço"} — ${project.code}`, agreedAmountCents: amount, invoicedAmountCents: null, invoiceFileId: null, invoiceNumber: null, dueAt: due, paidAt: status === "pago" ? (isoAt(m.paidAt) ?? due) : null, status, divergenceNote: null, invoiceIssuedAt: null };
        db.payables.push(pay);
        // link de NF sem e-mail (histórico não dispara mensagens); o Financeiro usa "Reenviar link" quando quiser
        if (status === "aguardando_nf") {
          const link = { ...baseFields(me.id), token: `nf-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`, purpose: "nf_freelancer" as const, projectId: project.id, targetId: pay.id, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), hasPassword: false, maxUses: 3, useCount: 0, revokedAt: null, ...CLIENT_LINK_DEFAULTS };
          db.shareLinks.push(link);
          db.freelancerInvoiceRequests.push({ ...baseFields(me.id), payableId: pay.id, shareLinkId: link.id, sentAt: nowIso(), submittedAt: null, declaredLegalName: null, declaredDocument: null, declaredPixKey: null, declaredInvoiceNumber: null, declaredAmountCents: null, source: null, reissueReason: null, reissueRequestedAt: null });
        }
      }
      summary.pagaveis++;
    }
    emit(db, me, { type: rep.action === "criar" ? "project.imported" : "project.import_updated", entityType: "project", entityId: project.id, project, data: { legacyCode: row.legacyCode, line: row.line } });
  }

  const errors = lines.flatMap((l) => l.errors.map((message) => ({ line: l.line, message })));
  return { total: rows.length, ok: lines.filter((l) => l.action !== "erro").length, errors, lines, summary };
}

const assertCanImport = (me: User) => {
  if (!(["projects", "receivables", "payables"] as const).every((r) => canWriteAll(me, r))) throw new ApiError(403, "A planilha master cria projetos e lançamentos financeiros: só Administrador e Gestão importam. Peça a um deles.");
};

export const masterImportApi = {
  /** Dry run: aplica numa cópia do banco e devolve o relatório por linha — nada é gravado. */
  preview: (rows: MasterRow[]) =>
    read((db, me) => {
      assertCanImport(me);
      if (!rows.length) throw new ApiError(422, "A planilha não tem linhas de projeto.");
      if (rows.length > 2000) throw new ApiError(422, "A planilha passa de 2.000 linhas. Divida em arquivos menores.");
      return applyMaster(structuredClone(db), me, rows);
    }, 500),

  /** Grava as linhas sem erro, na ordem da seção 20.6, e registra o job. Reimportar atualiza (idempotente por ID). */
  commit: (fileName: string, rows: MasterRow[]) =>
    write((db, me) => {
      assertCanImport(me);
      const valid = rows.filter((r) => r.legacyCode);
      const report = applyMaster(db, me, valid);
      const job: ImportJob = { ...baseFields(me.id), kind: "planilha_master", sourceFileName: fileName, status: "concluida", dryRun: false, report: { total: rows.length, ok: report.ok, errors: [...report.errors, ...rows.filter((r) => !r.legacyCode).map((r) => ({ line: r.line, message: "ID vazio (ex.: P001)" }))], summary: report.summary } };
      db.imports.push(job);
      emit(db, me, { type: "import.completed", entityType: "import", entityId: job.id, data: { kind: "planilha_master", imported: report.ok, summary: report.summary } });
      return { job, report };
    }, 800),
};

/** Colunas do modelo da aba "Projetos & Pagamentos" (as da planilha real também são aceitas). */
export const MASTER_TEMPLATE_HEADERS = [
  "ID", "PROJETO", "Cliente", "CNPJ Cliente", "Data Entrada", "Tamanho", "Tipo de Projeto", "Valor Total (R$)", "Data Emissão NF",
  "Previsão Pagto Parcela 1", "Data Pagto Parcela 1", "Valor Pagto Parcela 1", "Previsão Pagto Parcela 2", "Data Pagto Parcela 2", "Valor Pagto Parcela 2",
  "Status Projeto", "Data Entrega", "Obs Política Pagto Cliente", "Status/Comentários Cobrança",
  "Designer", "Valor", "Liberado para pagto?", "Data Pagto", "Status Pagto",
  "Advogado", "Valor", "Liberado para pagto?", "Data Pagto", "Status Pagto",
  "Roteirista", "Valor", "Liberado para pagto?", "Data Pagto", "Status Pagto",
  "Outros Freelancers", "Valor", "Liberado para pagto?", "Data Pagto", "Status Pagto",
  "Condição de Pagamento", "Valor Cobrança Adicional", "Status Cobrança Adicional", "Data Cobrança Adicional",
];
export const MASTER_TEMPLATE_EXAMPLE = [
  "P001", "Leroy - BMB", "Leroy Merlin", "11.222.333/0001-81", "10/03/2026", "Médio", "Apresentação PPT", "R$ 12.000,00", "15/04/2026",
  "15/04/2026", "05/05/2026", "R$ 6.000,00", "15/05/2026", "", "R$ 6.000,00",
  "Caso Finalizado", "30/04/2026", "20 dias após emissão da NF", "Parcela 2 cobrada em 20/05",
  "Ana Souza", "R$ 1.920", "SIM", "20/05/2026", "REALIZADO",
  "Não teve", "", "", "", "",
  "Bruno Lima", "R$ 800", "NÃO", "", "",
  "", "", "", "", "",
  "50/50", "", "", "",
];
