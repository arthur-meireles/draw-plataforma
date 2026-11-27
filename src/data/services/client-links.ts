/**
 * Envio ao cliente por link público (RN-51/52): proposta, pedido de aprovação e entrega de material.
 * Não há e-mail interno: o cliente recebe um e-mail TRANSACIONAL do sistema (`queueSystemEmail`) com o link
 * `/c/<token>` (30 dias, revogável). A resposta do cliente no link segue o mesmo caminho de domínio da ação interna.
 */
import { baseFields, loadDb, nowIso, transaction } from "../db";
import { CLIENT_LINK_DEFAULTS } from "../defaults";
import { PROJECT_STAGES } from "../reference";
import type { Approval, ClientLinkStatus, Database, ID, Project, ProjectStageKey, ShareLink, ShareLinkPurpose, ShareLinkResponse, User } from "../types";
import { ApiError, assertProjectVisible, emit, latency, queueSystemEmail, read, touch, write } from "./_core";
import { notifyMany } from "./audience";
import { decideApprovalTx } from "./collab";
import { approveProposalTx } from "./proposals";
import { canSeeMoney, canWrite, canWriteAll } from "@/lib/permissions";

export type ClientLinkPurpose = Exclude<ShareLinkPurpose, "nf_freelancer">;
export type { ClientLinkStatus };

/** Validade padrão do link enviado ao cliente. */
export const CLIENT_LINK_DAYS = 30;

const CLIENT_PURPOSES: ClientLinkPurpose[] = ["proposta", "aprovacao", "entrega"];
const isClientLink = (l: ShareLink): l is ShareLink & { purpose: ClientLinkPurpose } => (CLIENT_PURPOSES as string[]).includes(l.purpose);

const EMAIL_TEMPLATE: Record<ClientLinkPurpose, string> = { proposta: "proposta_cliente", aprovacao: "aprovacao_cliente", entrega: "entrega_cliente" };

function newToken() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return `cl-${[...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20)}`;
}

/** Destinatários: contatos escolhidos do cliente do projeto; sem escolha, o contato de cobrança (ou o decisor). */
export function resolveRecipients(db: Database, p: Project, contactIds?: ID[] | null): string[] {
  const contacts = db.clientContacts.filter((c) => c.clientId === p.clientId && !c.deletedAt && c.email.trim());
  let chosen = contactIds?.length ? contacts.filter((c) => contactIds.includes(c.id)) : [];
  if (contactIds?.length && chosen.length !== contactIds.length) throw new ApiError(422, "Escolha destinatários entre os contatos do cliente.", { contactIds: "Escolha contatos do cliente deste projeto" });
  if (!chosen.length) {
    const main = contacts.find((c) => c.id === p.billingContactId) ?? contacts.find((c) => c.isBillingContact) ?? contacts.find((c) => c.isDecisionMaker) ?? contacts[0];
    chosen = main ? [main] : [];
  }
  if (!chosen.length) throw new ApiError(422, "O cliente não tem contato com e-mail. Cadastre um contato na ficha do cliente para enviar.", { contactIds: "Cadastre um contato com e-mail no cliente" });
  return [...new Set(chosen.map((c) => c.email.trim()))];
}

const SUBJECT: Record<ClientLinkPurpose, (p: Project) => string> = {
  proposta: (p) => `Proposta Draw — ${p.title}`,
  aprovacao: (p) => `Material para sua aprovação — ${p.title}`,
  entrega: (p) => `Entrega de material — ${p.title}`,
};

/** Cria o link público e enfileira o e-mail transacional aos destinatários. */
export function createClientLink(
  db: Database,
  me: User,
  input: { purpose: ClientLinkPurpose; project: Project; targetId: ID; recipients: string[]; message: string | null; fileVersionIds: ID[] },
): ShareLink {
  const now = nowIso();
  const link: ShareLink = {
    ...baseFields(me.id),
    token: newToken(),
    purpose: input.purpose,
    projectId: input.project.id,
    targetId: input.targetId,
    expiresAt: new Date(Date.now() + CLIENT_LINK_DAYS * 86_400_000).toISOString(),
    hasPassword: false,
    maxUses: null,
    useCount: 0,
    revokedAt: null,
    ...CLIENT_LINK_DEFAULTS,
    fileVersionIds: input.fileVersionIds,
    recipients: input.recipients,
    message: input.message?.trim() || null,
    lastSentAt: now,
  };
  db.shareLinks.push(link);
  queueSystemEmail(db, { to: link.recipients, subject: SUBJECT[input.purpose](input.project), template: EMAIL_TEMPLATE[input.purpose], projectId: input.project.id });
  emit(db, me, { type: "share_link.sent", entityType: "share_link", entityId: link.id, project: input.project, data: { purpose: link.purpose, recipients: link.recipients, files: link.fileVersionIds.length } });
  return link;
}

/** O alvo do link ainda aceita resposta? (proposta enviada / aprovação pendente). */
function targetOpen(db: Database, l: ShareLink): boolean {
  if (l.purpose === "proposta") return db.proposals.find((x) => x.id === l.targetId)?.status === "enviada" && db.projects.find((p) => p.id === l.projectId)?.status === "cotacao";
  if (l.purpose === "aprovacao") return db.approvals.find((x) => x.id === l.targetId && !x.deletedAt)?.decision === "pendente";
  return false;
}

export function clientLinkStatus(db: Database, l: ShareLink): ClientLinkStatus {
  if (l.response === "aprovado") return "aprovado";
  if (l.response === "ajustes") return "ajustes";
  if (l.revokedAt) return "revogado";
  if (new Date(l.expiresAt).getTime() < Date.now()) return "expirado";
  if (l.purpose !== "entrega" && !targetOpen(db, l)) return "encerrado";
  return l.viewedAt ? "visto" : "enviado";
}

/** Arquivos liberáveis ao cliente: só os do projeto, nunca proposta/NF (essas saem pelo link de proposta). */
function resolveFileVersions(db: Database, p: Project, fileIds: ID[]): ID[] {
  const ids: ID[] = [];
  for (const fid of fileIds) {
    const f = db.files.find((x) => x.id === fid && !x.deletedAt && x.projectId === p.id);
    if (!f || f.category === "nf" || f.category === "proposta") throw new ApiError(422, "Escolha arquivos do próprio projeto (propostas e notas fiscais não vão por este link).", { fileIds: "Arquivo inválido" });
    ids.push(f.currentVersionId);
  }
  return ids;
}

function assertCanSendWork(me: User) {
  if (me.role === "freelancer" || !canWrite(me, "projects")) throw new ApiError(403, "Seu perfil não pode enviar material ao cliente. Peça ao responsável pelo projeto.");
}

function assertLinkManageable(db: Database, me: User, l: ShareLink) {
  if (!isClientLink(l)) throw new ApiError(404, "Link não encontrado.");
  assertProjectVisible(db, me, l.projectId!);
  if (l.purpose === "proposta") {
    if (!canWriteAll(me, "commercial") || !canSeeMoney(me)) throw new ApiError(403, "Seu perfil não pode gerenciar links de proposta. Peça a alguém do Comercial.");
  } else assertCanSendWork(me);
}

const STAGE_LABEL = (k: ProjectStageKey) => PROJECT_STAGES.find((s) => s.key === k)?.label ?? k;

export const clientLinksApi = {
  /** Envios ao cliente do projeto, com status (enviado, visto, aprovado, ajustes pedidos, expirado…). */
  list: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      if (me.role === "freelancer") throw new ApiError(403, "Seu perfil não acompanha os envios ao cliente.");
      const money = canSeeMoney(me);
      return db.shareLinks
        .filter((l) => l.projectId === p.id && !l.deletedAt && isClientLink(l) && (money || l.purpose !== "proposta"))
        .sort((a, b) => (b.lastSentAt ?? b.createdAt).localeCompare(a.lastSentAt ?? a.createdAt))
        .map((l) => {
          const prop = l.purpose === "proposta" ? db.proposals.find((x) => x.id === l.targetId) : null;
          const appr = l.purpose === "aprovacao" ? db.approvals.find((x) => x.id === l.targetId) : null;
          return {
            id: l.id,
            token: l.token,
            purpose: l.purpose as ClientLinkPurpose,
            status: clientLinkStatus(db, l),
            subject: prop ? `Proposta v${prop.version}` : appr ? `Aprovação — ${STAGE_LABEL(appr.stageKey)}` : "Entrega de material",
            recipients: l.recipients,
            files: l.fileVersionIds.map((vid) => {
              const v = db.fileVersions.find((x) => x.id === vid);
              const f = v ? db.files.find((x) => x.id === v.fileId) : null;
              return { versionId: vid, name: f?.name ?? "Arquivo removido", version: v?.version ?? null };
            }),
            message: l.message,
            sentAt: l.lastSentAt ?? l.createdAt,
            sentByName: db.users.find((u) => u.id === l.createdBy)?.name ?? null,
            expiresAt: l.expiresAt,
            viewedAt: l.viewedAt,
            respondedAt: l.respondedAt,
            response: l.response,
            responseComment: l.responseComment,
            respondentName: l.respondentName,
            revokedAt: l.revokedAt,
          };
        });
    }),

  /** Contatos do cliente que podem receber (com e-mail); `isDefault` = sugerido quando ninguém é escolhido. */
  recipients: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      if (me.role === "freelancer") throw new ApiError(403, "Seu perfil não envia material ao cliente.");
      const contacts = db.clientContacts.filter((c) => c.clientId === p.clientId && !c.deletedAt && c.email.trim());
      let def: string | null = null;
      try {
        def = resolveRecipients(db, p)[0] ?? null;
      } catch {
        def = null;
      }
      return contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, jobTitle: c.jobTitle, isBillingContact: c.isBillingContact, isDecisionMaker: c.isDecisionMaker, isDefault: c.email === def }));
    }),

  /**
   * Prontuário › Aprovações › "Pedir aprovação ao cliente" (RN-52): cria (ou reaproveita a pendente da etapa) a
   * aprovação e envia o link com os arquivos escolhidos. Avisa o responsável do projeto.
   */
  requestApproval: (projectId: ID, input: { stageKey: ProjectStageKey; contactIds?: ID[]; fileIds: ID[]; message?: string | null; approvalId?: ID | null }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      assertCanSendWork(me);
      if (p.status !== "ativo") throw new ApiError(409, "Só projetos ativos pedem aprovação ao cliente.");
      if (!input.fileIds.length) throw new ApiError(422, "Escolha ao menos um arquivo para o cliente avaliar.", { fileIds: "Escolha ao menos um arquivo" });
      const fileVersionIds = resolveFileVersions(db, p, input.fileIds);
      const recipients = resolveRecipients(db, p, input.contactIds);
      const names = db.clientContacts.filter((c) => c.clientId === p.clientId && recipients.includes(c.email)).map((c) => c.name).join(", ") || "Cliente";
      let a: Approval | undefined = input.approvalId ? db.approvals.find((x) => x.id === input.approvalId && x.projectId === p.id && !x.deletedAt) : undefined;
      if (input.approvalId && !a) throw new ApiError(404, "Aprovação não encontrada.");
      if (a && a.decision !== "pendente") throw new ApiError(409, "Esta aprovação já foi decidida. Peça uma nova aprovação.");
      if (!a) {
        a = { ...baseFields(me.id), projectId: p.id, stageKey: input.stageKey, requestedFrom: names, decision: "pendente", reason: null, decidedBy: null, decidedAt: null, requestedBy: me.id, shareLinkId: null, decidedVia: null, decidedByName: null };
        db.approvals.push(a);
        emit(db, me, { type: "approval.requested", entityType: "approval", entityId: a.id, project: p, data: { stageKey: a.stageKey, requestedFrom: a.requestedFrom, via: "link_cliente" } });
      } else {
        a.requestedBy = a.requestedBy ?? me.id;
        a.requestedFrom = names;
        touch(a);
      }
      // um link ativo por aprovação: o anterior é revogado
      db.shareLinks.filter((l) => l.purpose === "aprovacao" && l.targetId === a!.id && !l.revokedAt && !l.response).forEach((l) => (l.revokedAt = nowIso()));
      const link = createClientLink(db, me, { purpose: "aprovacao", project: p, targetId: a.id, recipients, message: input.message ?? null, fileVersionIds });
      a.shareLinkId = link.id;
      notifyMany(db, me, [p.ownerId], { type: "aprovacao", title: `Aprovação pedida ao cliente — ${STAGE_LABEL(a.stageKey)}`, body: `${me.name} enviou ${fileVersionIds.length} arquivo(s) para ${names}`, project: p, entityType: "approval", entityId: a.id });
      return { approval: a, linkId: link.id };
    }),

  /** "Enviar entrega ao cliente": link com os arquivos escolhidos para ver e baixar. */
  sendDelivery: (projectId: ID, input: { contactIds?: ID[]; fileIds: ID[]; message?: string | null }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      assertCanSendWork(me);
      if (p.status !== "ativo" && p.status !== "concluido") throw new ApiError(409, "Só projetos ativos ou concluídos enviam entregas ao cliente.");
      if (!input.fileIds.length) throw new ApiError(422, "Escolha ao menos um arquivo para entregar.", { fileIds: "Escolha ao menos um arquivo" });
      const fileVersionIds = resolveFileVersions(db, p, input.fileIds);
      const recipients = resolveRecipients(db, p, input.contactIds);
      const link = createClientLink(db, me, { purpose: "entrega", project: p, targetId: p.id, recipients, message: input.message ?? null, fileVersionIds });
      return { linkId: link.id };
    }),

  /** Reenviar: renova a validade, reativa se revogado e manda o e-mail de novo. */
  resend: (linkId: ID) =>
    write((db, me) => {
      const l = db.shareLinks.find((x) => x.id === linkId && !x.deletedAt);
      if (!l) throw new ApiError(404, "Link não encontrado.");
      assertLinkManageable(db, me, l);
      if (l.response) throw new ApiError(409, "O cliente já respondeu por este link. Envie um novo, se precisar.");
      if (l.purpose !== "entrega" && !targetOpen(db, l)) throw new ApiError(409, "Este envio já foi encerrado (decidido internamente ou substituído). Envie um novo.");
      const p = db.projects.find((x) => x.id === l.projectId)!;
      l.expiresAt = new Date(Date.now() + CLIENT_LINK_DAYS * 86_400_000).toISOString();
      l.revokedAt = null;
      l.lastSentAt = nowIso();
      touch(l);
      queueSystemEmail(db, { to: l.recipients, subject: SUBJECT[l.purpose as ClientLinkPurpose](p), template: EMAIL_TEMPLATE[l.purpose as ClientLinkPurpose], projectId: p.id });
      emit(db, me, { type: "share_link.resent", entityType: "share_link", entityId: l.id, project: p, data: { purpose: l.purpose, recipients: l.recipients } });
      return { id: l.id };
    }),

  revoke: (linkId: ID) =>
    write((db, me) => {
      const l = db.shareLinks.find((x) => x.id === linkId && !x.deletedAt);
      if (!l) throw new ApiError(404, "Link não encontrado.");
      assertLinkManageable(db, me, l);
      if (l.revokedAt) return { id: l.id };
      l.revokedAt = nowIso();
      touch(l);
      emit(db, me, { type: "share_link.revoked", entityType: "share_link", entityId: l.id, project: db.projects.find((x) => x.id === l.projectId), data: { purpose: l.purpose } });
      return { id: l.id };
    }),
};

/* ───────── Página pública /c/[token] (sem sessão) ───────── */

/** Resposta do cliente com comentário vira comentário externo na aba Comentários (autor = nome informado, "via link"). */
function addClientComment(db: Database, projectId: ID, name: string, body: string) {
  db.comments.push({ ...baseFields(null), projectId, taskId: null, authorId: null, body, mentions: [], externalAuthorName: name });
}

function openLink(db: Database, token: string) {
  const l = db.shareLinks.find((s) => s.token === token && !s.deletedAt);
  if (!l || !isClientLink(l)) throw new ApiError(404, "Link inválido. Confira o endereço recebido por e-mail.");
  if (l.revokedAt) throw new ApiError(409, "Este link foi desativado pela Draw. Peça um novo ao seu contato.");
  if (new Date(l.expiresAt).getTime() < Date.now()) throw new ApiError(409, "Este link expirou. Peça um novo ao seu contato na Draw.");
  return l;
}

export const publicClientLinkApi = {
  /** Abre o link (registra a primeira visualização) e devolve o que o cliente pode ver. */
  get: async (token: string) => {
    await latency();
    return structuredClone(
      transaction((db) => {
        const l = openLink(db, token);
        const p = db.projects.find((x) => x.id === l.projectId)!;
        if (!l.viewedAt) {
          l.viewedAt = nowIso();
          emit(db, null, { type: "share_link.viewed", entityType: "share_link", entityId: l.id, project: p, data: { purpose: l.purpose } });
        }
        l.useCount += 1;
        const client = db.clients.find((c) => c.id === p.clientId);
        const files = l.fileVersionIds
          .map((vid) => {
            const v = db.fileVersions.find((x) => x.id === vid && !x.deletedAt);
            const f = v ? db.files.find((x) => x.id === v.fileId && !x.deletedAt) : null;
            return v && f ? { versionId: v.id, name: f.name, version: v.version, size: v.size, mime: v.mime } : null;
          })
          .filter((x): x is NonNullable<typeof x> => !!x);
        const prop = l.purpose === "proposta" ? db.proposals.find((x) => x.id === l.targetId) : null;
        const propFile = prop?.fileId ? db.files.find((f) => f.id === prop.fileId && !f.deletedAt) : null;
        const propVersion = propFile ? db.fileVersions.find((v) => v.id === propFile.currentVersionId) : null;
        const appr = l.purpose === "aprovacao" ? db.approvals.find((x) => x.id === l.targetId) : null;
        return {
          purpose: l.purpose as ClientLinkPurpose,
          organizationName: db.organizations[0]?.name ?? "Draw",
          project: { code: p.code, title: p.title, clientName: client?.tradeName ?? "" },
          message: l.message,
          sentAt: l.lastSentAt ?? l.createdAt,
          expiresAt: l.expiresAt,
          canRespond: l.purpose !== "entrega" && !l.response && targetOpen(db, l),
          response: l.response ? { decision: l.response, comment: l.responseComment, name: l.respondentName, at: l.respondedAt } : null,
          files: propVersion && propFile ? [{ versionId: propVersion.id, name: propFile.name, version: propVersion.version, size: propVersion.size, mime: propVersion.mime }, ...files] : files,
          proposal: prop
            ? {
                version: prop.version,
                amountCents: prop.amountCents,
                paymentTermsNote: prop.paymentTermsNote,
                status: prop.status,
                scope: p.briefing,
                installments: db.proposalInstallments
                  .filter((i) => i.proposalId === prop.id && !i.deletedAt)
                  .sort((a, b) => a.number - b.number)
                  .map((i) => ({ number: i.number, amountCents: i.amountCents, dueRule: i.dueRule, dueAt: i.dueAt })),
              }
            : null,
          approval: appr ? { stageLabel: STAGE_LABEL(appr.stageKey), decision: appr.decision } : null,
        };
      }),
    );
  },

  /** Download de um arquivo liberado no link (mock: data URL quando houver). */
  download: async (token: string, versionId: ID) => {
    await latency(60);
    const db = loadDb();
    const l = openLink(db, token);
    const prop = l.purpose === "proposta" ? db.proposals.find((x) => x.id === l.targetId) : null;
    const propVersionId = prop?.fileId ? db.files.find((f) => f.id === prop.fileId)?.currentVersionId : null;
    if (!l.fileVersionIds.includes(versionId) && versionId !== propVersionId) throw new ApiError(404, "Arquivo não encontrado neste link.");
    const v = db.fileVersions.find((x) => x.id === versionId);
    const f = v ? db.files.find((x) => x.id === v.fileId) : null;
    if (!v || !f) throw new ApiError(404, "Arquivo não encontrado neste link.");
    return { name: f.name, url: v.dataUrl };
  },

  /**
   * Resposta do cliente (RN-51/52): "aprovado" segue o mesmo caminho da aprovação interna; "ajustes" exige comentário.
   * Registra quem (nome informado) e quando, "via link" — sem IP.
   */
  respond: async (token: string, input: { decision: ShareLinkResponse; name: string; comment?: string | null }) => {
    await latency(300);
    return structuredClone(
      transaction((db) => {
        const l = openLink(db, token);
        if (l.purpose === "entrega") throw new ApiError(409, "Este link é só para ver e baixar o material.");
        if (l.response) throw new ApiError(409, "Você já respondeu por este link. Obrigado!");
        if (!targetOpen(db, l)) throw new ApiError(409, "Este pedido não está mais aberto para resposta. Fale com seu contato na Draw.");
        const errors: Record<string, string> = {};
        if (!input.name.trim()) errors.name = "Informe seu nome";
        if (input.decision === "ajustes" && !input.comment?.trim()) errors.comment = "Conte o que precisa ajustar";
        if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
        const name = input.name.trim();
        const comment = input.comment?.trim() || null;
        const p = db.projects.find((x) => x.id === l.projectId)!;
        l.response = input.decision;
        l.respondedAt = nowIso();
        l.respondentName = name;
        l.responseComment = comment;
        touch(l);
        if (l.purpose === "proposta") {
          const prop = db.proposals.find((x) => x.id === l.targetId)!;
          if (input.decision === "aprovado") {
            approveProposalTx(db, null, prop, { kind: "link_cliente", respondentName: name, shareLinkId: l.id });
          } else {
            if (p.quoteStageKey !== "negociacao") {
              emit(db, null, { type: "project.quote_stage_changed", entityType: "project", entityId: p.id, project: p, data: { from: p.quoteStageKey, to: "negociacao" } });
              p.quoteStageKey = "negociacao";
              touch(p);
            }
            emit(db, null, { type: "proposal.adjustments_requested", entityType: "proposal", entityId: prop.id, project: p, data: { version: prop.version, comment, respondentName: name, via: "link_cliente" } });
            notifyMany(db, null, [p.ownerId, l.createdBy], { type: "cliente", title: `Cliente pediu ajustes na proposta v${prop.version}`, body: `${name}: "${comment}"`, project: p, entityType: "proposal", entityId: prop.id });
            addClientComment(db, p.id, name, `Pedido de ajustes na proposta v${prop.version}: ${comment}`);
          }
        } else {
          const a = db.approvals.find((x) => x.id === l.targetId)!;
          decideApprovalTx(db, null, a, input.decision, comment, { via: "link_cliente", name });
          if (comment) addClientComment(db, p.id, name, `${input.decision === "ajustes" ? "Pedido de ajustes" : "Aprovação"} (${PROJECT_STAGES.find((s) => s.key === a.stageKey)?.label ?? a.stageKey}): ${comment}`);
        }
        return { decision: l.response };
      }),
    );
  },
};

