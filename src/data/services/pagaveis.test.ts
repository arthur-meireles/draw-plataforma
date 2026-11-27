/** Contas a pagar de freelancer fora do caminho feliz: NF manual (RN-41), nova NF (RN-42), conclusão sem valor (RN-40) e pagamento avulso (RN-43). */
import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, resetDb } from "../db";
import { setSessionUserId } from "./_core";
import { financeApi, payablesExtraApi, projectsApi, projectsExtraApi, publicInvoiceApi } from "./index";

const as = (userId: string) => setSessionUserId(userId);
const typeByPrefix = (p: string) => loadDb().projectTypes.find((t) => t.codePrefix === p)!;
const save = (db: ReturnType<typeof loadDb>) => window.localStorage.setItem("draw:db", JSON.stringify(db));

beforeEach(() => {
  window.localStorage.clear();
  resetDb();
  as("usr_paula");
});

/** Projeto ativo com dois freelancers: um com valor, outro "a combinar" (o de login, Julia). */
async function projectWithTeam() {
  const db = loadDb();
  const julia = db.freelancers.find((f) => f.userId === "usr_julia")!;
  const other = db.freelancers.find((f) => f.id !== julia.id && f.status === "ativo")!;
  const p = await projectsApi.createDirect({
    clientId: db.clients[0].id,
    projectTypeId: typeByPrefix("INF").id,
    title: "Infográfico",
    ownerId: "usr_beatriz",
    contractedAmountCents: 1_000_000,
    installments: [{ description: "Única", amountCents: 1_000_000, expectedAt: new Date().toISOString() }],
    team: [
      { freelancerId: other.id, memberRole: "designer", agreedAmountCents: 200_000 },
      { freelancerId: julia.id, memberRole: "roteirista", agreedAmountCents: null },
    ],
    dueAt: null,
  });
  const members = loadDb().projectMembers.filter((m) => m.projectId === p.id && m.freelancerId);
  return { p, julia, other, withAmount: members.find((m) => m.freelancerId === other.id)!, withoutAmount: members.find((m) => m.freelancerId === julia.id)! };
}

const pendingPayable = () => {
  const db = loadDb();
  const pay = db.payables.find((p) => p.status === "aguardando_nf" && p.kind === "freelancer")!;
  const req = db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id)!;
  const link = db.shareLinks.find((s) => s.id === req.shareLinkId)!;
  link.expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  save(db);
  return { pay, token: link.token };
};

describe("RN-40 — conclusão nunca pula freelancer sem valor", () => {
  it("exige decisão para quem está sem valor e não grava nada sem ela", async () => {
    const { p, withoutAmount } = await projectWithTeam();
    const preview = await projectsExtraApi.completionPreview(p.id);
    expect(preview.freelancers.find((f) => f.memberId === withoutAmount.id)?.needsDecision).toBe(true);
    await expect(projectsApi.complete(p.id)).rejects.toMatchObject({ status: 422, fieldErrors: { [`member:${withoutAmount.id}`]: expect.any(String) } });
    expect(loadDb().projects.find((x) => x.id === p.id)!.status).toBe("ativo");
    expect(loadDb().payables.filter((x) => x.projectId === p.id)).toHaveLength(0);
  });

  it("valor informado na conclusão vira acordado e gera pagável; 'sem pagamento' fica registrado", async () => {
    const { p, withoutAmount, julia } = await projectWithTeam();
    const r = await projectsApi.complete(p.id, [{ memberId: withoutAmount.id, action: "pagar", amountCents: 80_000 }]);
    expect(r.payablesCreated).toBe(2);
    const db = loadDb();
    expect(db.projectMembers.find((m) => m.id === withoutAmount.id)!.agreedAmountCents).toBe(80_000);
    expect(db.payables.find((x) => x.projectMemberId === withoutAmount.id)!.status).toBe("aguardando_nf");
    expect(db.notifications.some((n) => n.userId === julia.userId && n.type === "nf_solicitada")).toBe(true);

    const second = await projectWithTeam();
    const r2 = await projectsApi.complete(second.p.id, [{ memberId: second.withoutAmount.id, action: "sem_pagamento" }]);
    expect(r2.payablesCreated).toBe(1);
    expect(loadDb().projectMembers.find((m) => m.id === second.withoutAmount.id)!.paymentWaived).toBe(true);
  });

  it("freelancer removido antes da conclusão com valor acordado aparece para decidir", async () => {
    const { p, withAmount, withoutAmount } = await projectWithTeam();
    await projectsApi.removeMember(withAmount.id);
    const preview = await projectsExtraApi.completionPreview(p.id);
    const removed = preview.freelancers.find((f) => f.memberId === withAmount.id)!;
    expect(removed).toMatchObject({ active: false, needsDecision: true });
    const r = await projectsApi.complete(p.id, [
      { memberId: withAmount.id, action: "pagar" },
      { memberId: withoutAmount.id, action: "sem_pagamento" },
    ]);
    expect(r.payablesCreated).toBe(1);
    expect(loadDb().payables.find((x) => x.projectMemberId === withAmount.id)!.agreedAmountCents).toBe(200_000);
  });
});

describe("RN-43 — pagamento avulso a freelancer da equipe", () => {
  it("cria pagável + link + e-mail, é idempotente por membro e aceita adicional explícito", async () => {
    const { p, withoutAmount, julia } = await projectWithTeam();
    as("usr_fernanda");
    const emails = loadDb().emailLogs.length;
    const pay = await payablesExtraApi.createFreelancerPayment({ projectId: p.id, memberId: withoutAmount.id, amountCents: 50_000 });
    const db = loadDb();
    expect(pay.status).toBe("aguardando_nf");
    expect(db.shareLinks.some((s) => s.targetId === pay.id && s.purpose === "nf_freelancer")).toBe(true);
    expect(db.emailLogs.length).toBe(emails + 1);
    expect(db.emailLogs.at(-1)!.to).toEqual([julia.email]);
    await expect(payablesExtraApi.createFreelancerPayment({ projectId: p.id, memberId: withoutAmount.id, amountCents: 50_000 })).rejects.toMatchObject({ status: 409 });
    const extra = await payablesExtraApi.createFreelancerPayment({ projectId: p.id, memberId: withoutAmount.id, amountCents: 10_000, additional: true });
    expect(extra.agreedAmountCents).toBe(10_000);
    // o adicional não mexe no valor acordado
    expect(loadDb().projectMembers.find((m) => m.id === withoutAmount.id)!.agreedAmountCents).toBe(50_000);
  });

  it("perfil sem contas a pagar (T) recebe 403", async () => {
    const { p, withoutAmount } = await projectWithTeam();
    as("usr_lucas");
    await expect(payablesExtraApi.createFreelancerPayment({ projectId: p.id, memberId: withoutAmount.id, amountCents: 1 })).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-41 — NF registrada manualmente", () => {
  it("leva de aguardando NF a conferência (ou divergente) e registra no histórico", async () => {
    const { pay } = pendingPayable();
    as("usr_fernanda");
    const ok = await payablesExtraApi.registerInvoice(pay.id, { invoiceNumber: "123", amountCents: pay.agreedAmountCents, issuedAt: new Date().toISOString() });
    expect(ok.status).toBe("em_conferencia");
    const db = loadDb();
    expect(db.freelancerInvoiceRequests.find((r) => r.payableId === pay.id)!.source).toBe("manual");
    expect(db.events.some((e) => e.entityId === pay.id && e.type === "payable.invoice_registered")).toBe(true);
    await financeApi.approvePayable(pay.id);
    await financeApi.pay(pay.id, new Date().toISOString());
    expect(loadDb().payables.find((x) => x.id === pay.id)!.status).toBe("pago");
  });

  it("valor diferente vira divergente; status errado e perfil sem permissão são barrados", async () => {
    const { pay } = pendingPayable();
    await expect(payablesExtraApi.registerInvoice(pay.id, { invoiceNumber: "", amountCents: 0, issuedAt: "" })).rejects.toMatchObject({ status: 422 });
    const div = await payablesExtraApi.registerInvoice(pay.id, { invoiceNumber: "9", amountCents: pay.agreedAmountCents + 1000, issuedAt: new Date().toISOString() });
    expect(div.status).toBe("divergente");
    expect(div.divergenceNote).toBeTruthy();
    await financeApi.approvePayable(pay.id);
    await expect(payablesExtraApi.registerInvoice(pay.id, { invoiceNumber: "9", amountCents: 1, issuedAt: new Date().toISOString() })).rejects.toMatchObject({ status: 409 });
    as("usr_julia");
    await expect(payablesExtraApi.registerInvoice(pay.id, { invoiceNumber: "9", amountCents: 1, issuedAt: new Date().toISOString() })).rejects.toMatchObject({ status: 403 });
  });
});

describe("RN-42 — pedir nova NF", () => {
  it("volta a aguardando NF, renova o link, avisa o freelancer e o formulário aceita novo envio com o motivo", async () => {
    const { pay, token } = pendingPayable();
    const first = await publicInvoiceApi.submit(token, { legalName: "A", document: "12345678901", pixKey: "x", invoiceNumber: "1", amountCents: pay.agreedAmountCents - 100, fileName: "nf.pdf", fileSize: 10, dataUrl: null });
    expect(first.status).toBe("divergente");
    // reenvio sem pedido da Draw é recusado pelo servidor
    await expect(publicInvoiceApi.submit(token, { legalName: "A", document: "12345678901", pixKey: "x", invoiceNumber: "2", amountCents: pay.agreedAmountCents, fileName: "nf.pdf", fileSize: 10, dataUrl: null })).rejects.toMatchObject({ status: 409 });

    as("usr_fernanda");
    await expect(payablesExtraApi.requestNewInvoice(pay.id, " ")).rejects.toMatchObject({ status: 422 });
    const emails = loadDb().emailLogs.length;
    const res = await payablesExtraApi.requestNewInvoice(pay.id, "Valor errado: emita com R$ 2.000,00");
    expect(res.payable).toMatchObject({ status: "aguardando_nf", invoiceNumber: null, invoicedAmountCents: null, divergenceNote: null });
    const db = loadDb();
    const link = db.shareLinks.find((s) => s.token === res.token)!;
    expect(link.useCount).toBe(0);
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect(db.emailLogs.length).toBe(emails + 1);
    expect(db.events.some((e) => e.entityId === pay.id && e.type === "payable.invoice_rejected")).toBe(true);

    const info = await publicInvoiceApi.get(res.token);
    expect(info.status).toBe("aguardando_nf");
    expect(info.submittedAt).toBeNull();
    expect(info.reissueReason).toContain("Valor errado");
    const again = await publicInvoiceApi.submit(res.token, { legalName: "A", document: "12345678901", pixKey: "x", invoiceNumber: "2", amountCents: pay.agreedAmountCents, fileName: "nf.pdf", fileSize: 10, dataUrl: null });
    expect(again.status).toBe("em_conferencia");
  });

  it("NF aprovada não pode ser recusada", async () => {
    const { pay } = pendingPayable();
    await payablesExtraApi.registerInvoice(pay.id, { invoiceNumber: "1", amountCents: pay.agreedAmountCents, issuedAt: new Date().toISOString() });
    await financeApi.approvePayable(pay.id);
    await expect(payablesExtraApi.requestNewInvoice(pay.id, "x")).rejects.toMatchObject({ status: 409 });
  });
});
