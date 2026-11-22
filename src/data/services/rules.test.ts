/**
 * Testes das regras de negócio (RNF-BE-03 / DoD da seção 16) contra a "API" local.
 * Os mesmos cenários viram testes de contrato quando o back-end existir.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { approvalsApi, financeApi, projectsApi, proposalsApi, publicInvoiceApi, tasksApi } from "./index";
import { isValidCnpj } from "@/lib/format";

const as = (userId: string) => setSessionUserId(userId);
const someClient = () => loadDb().clients[0];
const typeByPrefix = (p: string) => loadDb().projectTypes.find((t) => t.codePrefix === p)!;

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as("usr_paula");
});

describe("RN-05 — código do projeto", () => {
  it("gera {prefixo}-{sequencial} e nunca reutiliza", async () => {
    const before = loadDb().codeSequences.MEM;
    const a = await projectsApi.createQuote({ clientId: someClient().id, projectTypeId: typeByPrefix("MEM").id, title: "A", ownerId: "usr_carlos" });
    const b = await projectsApi.createQuote({ clientId: someClient().id, projectTypeId: typeByPrefix("MEM").id, title: "B", ownerId: "usr_carlos" });
    expect(a.code).toBe(`MEM-${String(before + 1).padStart(3, "0")}`);
    expect(b.code).toBe(`MEM-${String(before + 2).padStart(3, "0")}`);
  });
});

describe("RN-01 — aprovação de proposta", () => {
  it("ativa o projeto, cria recebíveis das parcelas e gera tarefas em uma transação", async () => {
    const p = await projectsApi.createQuote({ clientId: someClient().id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: "usr_carlos" });
    const prop = await proposalsApi.create(p.id, {
      amountCents: 1_000_000,
      installments: [
        { amountCents: 500_000, dueRule: "Na aprovação", dueAt: null },
        { amountCents: 500_000, dueRule: "Na entrega", dueAt: null },
      ],
    });
    await expect(proposalsApi.approve(prop.id)).rejects.toThrow(/Envie a proposta/);
    await proposalsApi.send(prop.id);
    expect(loadDb().projects.find((x) => x.id === p.id)!.quoteSentAt).not.toBeNull(); // RN-11
    await proposalsApi.approve(prop.id);
    const db = loadDb();
    const proj = db.projects.find((x) => x.id === p.id)!;
    expect(proj.status).toBe("ativo");
    expect(proj.projectStageKey).toBe("roteiro");
    expect(proj.contractedAmountCents).toBe(1_000_000);
    expect(proj.approvedAt).not.toBeNull();
    expect(db.receivables.filter((r) => r.projectId === p.id)).toHaveLength(2);
    expect(db.tasks.filter((t) => t.projectId === p.id && t.module === "projeto").length).toBeGreaterThan(0);
    expect(db.events.some((e) => e.type === "proposal.approved" && e.projectId === p.id)).toBe(true);
  });

  it("rejeita parcelas que não somam o valor da proposta", async () => {
    const p = await projectsApi.createQuote({ clientId: someClient().id, projectTypeId: typeByPrefix("APR").id, title: "Deck", ownerId: "usr_carlos" });
    await expect(proposalsApi.create(p.id, { amountCents: 1_000_000, installments: [{ amountCents: 400_000, dueRule: null, dueAt: null }] })).rejects.toMatchObject({ status: 422 });
  });
});

describe("RN-02 — projeto direto", () => {
  it("exige ao menos uma parcela e soma igual ao contratado", async () => {
    const base = { clientId: someClient().id, projectTypeId: typeByPrefix("CTV").id, title: "Contrato", ownerId: "usr_beatriz", team: [], dueAt: null };
    await expect(projectsApi.createDirect({ ...base, contractedAmountCents: 500_000, installments: [] })).rejects.toMatchObject({ status: 422, fieldErrors: { installments: expect.any(String) } });
    const p = await projectsApi.createDirect({ ...base, contractedAmountCents: 500_000, installments: [{ description: "Única", amountCents: 500_000, expectedAt: new Date().toISOString() }] });
    expect(p.status).toBe("ativo");
    expect(p.origin).toBe("direto");
    expect(loadDb().receivables.filter((r) => r.projectId === p.id)).toHaveLength(1);
  });
});

describe("RN-03 / RN-04 — conclusão e NF do freelancer", () => {
  it("concluir cria contas a pagar com link; NF divergente é detectada", async () => {
    const p = await projectsApi.createDirect({
      clientId: someClient().id,
      projectTypeId: typeByPrefix("INF").id,
      title: "Infográfico",
      ownerId: "usr_beatriz",
      contractedAmountCents: 1_000_000,
      installments: [{ description: "Única", amountCents: 1_000_000, expectedAt: new Date().toISOString() }],
      team: [{ freelancerId: loadDb().freelancers[2].id, memberRole: "designer", agreedAmountCents: 200_000 }],
      dueAt: null,
    });
    const r = await projectsApi.complete(p.id);
    expect(r.payablesCreated).toBe(1);
    const db = loadDb();
    const pay = db.payables.find((x) => x.projectId === p.id)!;
    expect(pay.status).toBe("aguardando_nf");
    expect(new Date(pay.dueAt).getUTCDate()).toBe(20); // RN-06
    const link = db.shareLinks.find((s) => s.targetId === pay.id)!;
    const res = await publicInvoiceApi.submit(link.token, { legalName: "Ana ME", document: "123", pixKey: "ana@x.com", invoiceNumber: "77", amountCents: 150_000, fileName: "nf.pdf", fileSize: 1000, dataUrl: null });
    expect(res.status).toBe("divergente");
    await financeApi.approvePayable(pay.id);
    expect(loadDb().payables.find((x) => x.id === pay.id)!.status).toBe("aprovado");
  });

  it("NF com valor igual vai para conferência", async () => {
    const pending = loadDb().payables.find((x) => x.status === "aguardando_nf")!;
    const link = loadDb().shareLinks.find((s) => s.targetId === pending.id)!;
    link.expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const res = await publicInvoiceApi.submit(link.token, { legalName: "X", document: "1", pixKey: "", invoiceNumber: "1", amountCents: pending.agreedAmountCents, fileName: "nf.pdf", fileSize: 10, dataUrl: null });
    expect(res.status).toBe("em_conferencia");
  });
});

describe("Autorização (P7 / RF-M1-04 / RF-M1-05 / RN-08)", () => {
  it("freelancer recebe 404 em projeto onde não está alocado", async () => {
    const db = loadDb();
    const juliaFl = db.freelancers.find((f) => f.userId === "usr_julia")!.id;
    const notMine = db.projects.find((p) => p.status === "ativo" && !db.projectMembers.some((m) => m.projectId === p.id && m.freelancerId === juliaFl))!;
    as("usr_julia");
    await expect(projectsApi.get(notMine.code)).rejects.toMatchObject({ status: 404 });
  });

  it("perfil operação nunca recebe valores no JSON", async () => {
    as("usr_lucas");
    const list = await projectsApi.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p) => p.contractedAmountCents === null)).toBe(true);
    await expect(projectsApi.financials(list[0].id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("Outras regras", () => {
  it("RN-12 — não troca de cliente após NF emitida", async () => {
    const db = loadDb();
    const issued = db.receivables.find((r) => r.issuedAt)!;
    const other = db.clients.find((c) => c.id !== issued.clientId)!;
    await expect(projectsApi.update(issued.projectId, { clientId: other.id })).rejects.toMatchObject({ status: 409 });
  });

  it("RF-M3-05 — perder cotação exige motivo", async () => {
    const quote = loadDb().projects.find((p) => p.status === "cotacao")!;
    await expect(projectsApi.markLost(quote.id, " ")).rejects.toMatchObject({ status: 422 });
    const lost = await projectsApi.markLost(quote.id, "Preço");
    expect(lost.status).toBe("perdido");
  });

  it("RF-M4-10 — ajustes exigem motivo", async () => {
    const pending = loadDb().approvals.find((a) => a.decision === "pendente")!;
    await expect(approvalsApi.decide(pending.id, "ajustes")).rejects.toMatchObject({ status: 422 });
    const ok = await approvalsApi.decide(pending.id, "ajustes", "Trocar a capa");
    expect(ok.decision).toBe("ajustes");
  });

  it("concluído não aceita arrastar para 'Concluído' sem a ação explícita", async () => {
    const active = loadDb().projects.find((p) => p.status === "ativo")!;
    await expect(projectsApi.move(active.id, { stageKey: "concluido", position: 0 })).rejects.toMatchObject({ status: 422 });
  });

  it("concluir tarefa registra data e evento", async () => {
    const t = loadDb().tasks.find((x) => x.statusKey === "a_fazer" && x.module === "projeto")!;
    await tasksApi.update(t.id, { statusKey: "concluida" });
    const after = loadDb().tasks.find((x) => x.id === t.id)!;
    expect(after.completedAt).not.toBeNull();
    expect(loadDb().events.some((e) => e.type === "task.status_changed" && e.entityId === t.id)).toBe(true);
  });

  it("seed só tem CNPJs válidos", () => {
    expect(loadDb().clients.every((c) => isValidCnpj(c.cnpj))).toBe(true);
  });
});
