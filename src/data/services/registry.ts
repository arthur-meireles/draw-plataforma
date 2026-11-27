/** Cadastros: clientes, contatos, grupos, freelancers, tipos de projeto (M2). */
import { baseFields, nowIso } from "../db";
import type { Address, Client, ClientContact, Freelancer, ID, ProjectStageKey, ProjectType, Specialty } from "../types";
import { ApiError, emit, freelancerIdOf, read, requireAccess, touch, visibleProjects, write } from "./_core";
import { issueUserInvite } from "./admin";
import { toListItem, computeFinancials } from "./projects";
import { canRead, canSeeMoney, canWriteAll, access } from "@/lib/permissions";
import { isValidCnpj, onlyDigits } from "@/lib/format";

export interface ClientInput {
  groupId?: ID | null;
  legalName: string;
  tradeName: string;
  cnpj: string;
  address: Address;
  segment: string;
  status: Client["status"];
  notes?: string | null;
  paymentTermsNote?: string | null;
  paymentTermDays?: number | null;
}

export interface FreelancerInput {
  name: string;
  email: string;
  phone?: string | null;
  legalName?: string | null;
  document?: string | null;
  pixKey?: string | null;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  jobTitle?: string | null;
  specialties: Specialty[];
  status: Freelancer["status"];
  notes?: string | null;
}

const COLORS = ["#3f76ff", "#0fa37f", "#d97706", "#db2777", "#7c3aed", "#0891b2"];

function maskFreelancer<T extends Freelancer>(f: T, canBank: boolean): T {
  if (canBank) return f;
  return { ...f, document: f.document ? "•••• protegido" : null, pixKey: f.pixKey ? "•••• protegido" : null, bankName: null, bankAgency: null, bankAccount: null };
}

export const clientsApi = {
  list: (f: { q?: string; groupId?: ID; status?: Client["status"]; segment?: string } = {}) =>
    read((db, me) => {
      if (!canRead(me, "clients")) throw new ApiError(403, "Sem acesso a clientes.");
      const q = f.q?.trim().toLowerCase();
      const qDigits = q ? onlyDigits(q) : "";
      return db.clients
        .filter((c) => !c.deletedAt)
        .filter((c) => !f.groupId || c.groupId === f.groupId)
        .filter((c) => !f.status || c.status === f.status)
        .filter((c) => !f.segment || c.segment === f.segment)
        .filter((c) => !q || `${c.legalName} ${c.tradeName}`.toLowerCase().includes(q) || (qDigits.length >= 3 && onlyDigits(c.cnpj).includes(qDigits)))
        .sort((a, b) => a.tradeName.localeCompare(b.tradeName))
        .map((c) => {
          const projects = db.projects.filter((p) => p.clientId === c.id && !p.deletedAt);
          return {
            ...c,
            groupName: db.clientGroups.find((g) => g.id === c.groupId)?.name ?? null,
            projectsTotal: projects.length,
            projectsActive: projects.filter((p) => p.status === "ativo").length,
            contractedCents: canSeeMoney(me) ? projects.reduce((a, p) => a + (p.contractedAmountCents ?? 0), 0) : null,
            lastProjectAt: projects.map((p) => p.enteredAt).sort().at(-1) ?? null,
          };
        });
    }),

  /** RF-M2-02 — ficha do cliente. */
  get: (id: ID) =>
    read((db, me) => {
      if (!canRead(me, "clients")) throw new ApiError(403, "Sem acesso a clientes.");
      const c = db.clients.find((x) => x.id === id && !x.deletedAt);
      if (!c) throw new ApiError(404, "Cliente não encontrado.");
      const money = canSeeMoney(me);
      const projects = visibleProjects(db, me).filter((p) => p.clientId === c.id);
      const receivables = money ? db.receivables.filter((r) => r.clientId === c.id && !r.deletedAt) : [];
      const fin = money ? projects.filter((p) => p.contractedAmountCents).map((p) => computeFinancials(db, p.id)) : [];
      return {
        ...c,
        group: db.clientGroups.find((g) => g.id === c.groupId) ?? null,
        siblings: c.groupId ? db.clients.filter((x) => x.groupId === c.groupId && x.id !== c.id && !x.deletedAt) : [],
        contacts: db.clientContacts.filter((x) => x.clientId === c.id && !x.deletedAt),
        projects: projects.map((p) => toListItem(db, p, me)),
        proposals: money ? db.proposals.filter((pr) => projects.some((p) => p.id === pr.projectId) && !pr.deletedAt).map((pr) => ({ ...pr, projectCode: projects.find((p) => p.id === pr.projectId)!.code })) : [],
        receivables: receivables.map((r) => ({ ...r, projectCode: db.projects.find((p) => p.id === r.projectId)?.code ?? "" })),
        indicators: {
          projects: projects.length,
          active: projects.filter((p) => p.status === "ativo").length,
          completed: projects.filter((p) => p.status === "concluido" || p.status === "arquivado").length,
          contractedCents: money ? fin.reduce((a, x) => a + x.contractedCents, 0) : null,
          receivedCents: money ? fin.reduce((a, x) => a + x.receivedCents, 0) : null,
          marginCents: money ? fin.reduce((a, x) => a + x.marginCents, 0) : null,
          ticketCents: money && fin.length ? Math.round(fin.reduce((a, x) => a + x.contractedCents, 0) / fin.length) : null,
        },
      };
    }),

  create: (input: ClientInput) =>
    write((db, me) => {
      if (!canWriteAll(me, "clients")) throw new ApiError(403, "Sem permissão para cadastrar clientes.");
      validateClient(input);
      if (db.clients.some((c) => !c.deletedAt && onlyDigits(c.cnpj) === onlyDigits(input.cnpj))) throw new ApiError(409, "Já existe um cliente com este CNPJ.", { cnpj: "CNPJ já cadastrado" });
      const c: Client = { ...baseFields(me.id), groupId: input.groupId ?? null, legalName: input.legalName.trim(), tradeName: input.tradeName.trim() || input.legalName.trim(), cnpj: input.cnpj, address: input.address, segment: input.segment, status: input.status, notes: input.notes ?? null, paymentTermsNote: input.paymentTermsNote ?? null, paymentTermDays: input.paymentTermDays ?? null };
      db.clients.push(c);
      emit(db, me, { type: "client.created", entityType: "client", entityId: c.id, data: { name: c.tradeName } });
      return c;
    }),

  update: (id: ID, input: ClientInput) =>
    write((db, me) => {
      if (!canWriteAll(me, "clients")) throw new ApiError(403, "Sem permissão.");
      const c = db.clients.find((x) => x.id === id);
      if (!c) throw new ApiError(404, "Cliente não encontrado.");
      validateClient(input);
      if (db.clients.some((x) => x.id !== id && !x.deletedAt && onlyDigits(x.cnpj) === onlyDigits(input.cnpj))) throw new ApiError(409, "Já existe um cliente com este CNPJ.", { cnpj: "CNPJ já cadastrado" });
      Object.assign(c, { ...input, groupId: input.groupId ?? null, notes: input.notes ?? null });
      touch(c);
      emit(db, me, { type: "client.updated", entityType: "client", entityId: c.id, data: {} });
      return c;
    }),

  remove: (id: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "clients")) throw new ApiError(403, "Sem permissão.");
      const c = db.clients.find((x) => x.id === id);
      if (!c) throw new ApiError(404, "Cliente não encontrado.");
      if (db.projects.some((p) => p.clientId === id && !p.deletedAt)) throw new ApiError(409, "Este cliente tem projetos e não pode ser excluído. Inative-o.");
      c.deletedAt = nowIso();
      emit(db, me, { type: "client.deleted", entityType: "client", entityId: c.id, data: {} });
    }),

  groups: () => read((db, me) => (requireAccess(me, "clients", "read"), db.clientGroups.filter((g) => !g.deletedAt).map((g) => ({ ...g, clients: db.clients.filter((c) => c.groupId === g.id && !c.deletedAt).length })))),

  createGroup: (name: string) =>
    write((db, me) => {
      requireAccess(me, "clients", "all", "Seu perfil só consulta clientes. Peça ao Comercial ou à gestão para criar o grupo.");
      if (!name.trim()) throw new ApiError(422, "Dê um nome ao grupo.", { name: "Dê um nome ao grupo" });
      const g = { ...baseFields(me.id), name: name.trim() };
      db.clientGroups.push(g);
      return g;
    }),

  contacts: (clientId: ID) =>
    read((db, me) => {
      requireAccess(me, "clients", "read");
      return db.clientContacts.filter((c) => c.clientId === clientId && !c.deletedAt);
    }),

  saveContact: (clientId: ID, input: Omit<ClientContact, keyof ReturnType<typeof baseFields> | "clientId">, id?: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "clients")) throw new ApiError(403, "Sem permissão.");
      if (!db.clients.some((c) => c.id === clientId && !c.deletedAt)) throw new ApiError(404, "Cliente não encontrado.");
      if (id && !db.clientContacts.some((c) => c.id === id && c.clientId === clientId)) throw new ApiError(404, "Contato não encontrado neste cliente.");
      if (!input.name.trim()) throw new ApiError(422, "Informe o nome do contato.", { name: "Informe o nome do contato" });
      if (!/^\S+@\S+\.\S+$/.test(input.email)) throw new ApiError(422, "E-mail inválido.", { email: "Informe um e-mail válido, ex.: nome@empresa.com.br" });
      if (input.isBillingContact) db.clientContacts.filter((c) => c.clientId === clientId).forEach((c) => (c.isBillingContact = false));
      if (id) {
        const c = db.clientContacts.find((x) => x.id === id)!;
        Object.assign(c, input);
        touch(c);
        return c;
      }
      const c: ClientContact = { ...baseFields(me.id), clientId, ...input };
      db.clientContacts.push(c);
      return c;
    }),

  removeContact: (id: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "clients")) throw new ApiError(403, "Sem permissão.");
      const c = db.clientContacts.find((x) => x.id === id);
      if (c) c.deletedAt = nowIso();
    }),

  segments: () => read((db, me) => (requireAccess(me, "clients", "read"), [...new Set(db.clients.filter((c) => !c.deletedAt).map((c) => c.segment))].sort())),
};

function validateClient(input: ClientInput) {
  const errors: Record<string, string> = {};
  if (!input.legalName.trim()) errors.legalName = "Informe a razão social";
  if (!isValidCnpj(input.cnpj)) errors.cnpj = "CNPJ inválido: confira os 14 dígitos";
  if (!input.segment.trim()) errors.segment = "Informe o segmento";
  if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
}

export const freelancersApi = {
  list: (f: { q?: string; specialty?: Specialty; status?: Freelancer["status"] } = {}) =>
    read((db, me) => {
      if (!canRead(me, "freelancers")) throw new ApiError(403, "Sem acesso.");
      const q = f.q?.trim().toLowerCase();
      const canBank = access(me, "freelancerBank") === "T";
      const myFl = freelancerIdOf(db, me);
      return db.freelancers
        .filter((x) => !x.deletedAt)
        .filter((x) => me.role !== "freelancer" || x.id === myFl)
        .filter((x) => !f.specialty || x.specialties.includes(f.specialty))
        .filter((x) => !f.status || x.status === f.status)
        .filter((x) => !q || `${x.name} ${x.email} ${x.jobTitle ?? ""}`.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((x) => {
          const members = db.projectMembers.filter((m) => m.freelancerId === x.id && !m.deletedAt);
          const activeProjects = members.filter((m) => m.active && db.projects.find((p) => p.id === m.projectId)?.status === "ativo").length;
          return {
            ...maskFreelancer(x, canBank || x.id === myFl),
            projectsTotal: members.length,
            // Resumo de pagamentos (planilha: Resumo Freelancers) — só com acesso a valores
            paymentsTotalCents: canSeeMoney(me) || x.id === myFl ? db.payables.filter((p) => p.freelancerId === x.id && !p.deletedAt).reduce((a, p) => a + (p.invoicedAmountCents ?? p.agreedAmountCents), 0) : null,
            paymentsPaidCents: canSeeMoney(me) || x.id === myFl ? db.payables.filter((p) => p.freelancerId === x.id && !p.deletedAt && p.status === "pago").reduce((a, p) => a + (p.invoicedAmountCents ?? p.agreedAmountCents), 0) : null,
            activeProjects,
            openTasks: db.tasks.filter((t) => t.assigneeFreelancerId === x.id && t.statusKey !== "concluida" && !t.deletedAt).length,
            hasLogin: !!x.userId,
          };
        });
    }),

  /** RF-M2-04 — ficha do freelancer. */
  get: (id: ID) =>
    read((db, me) => {
      if (!canRead(me, "freelancers")) throw new ApiError(403, "Sem acesso.");
      const myFl = freelancerIdOf(db, me);
      if (me.role === "freelancer" && id !== myFl) throw new ApiError(404, "Freelancer não encontrado.");
      const x = db.freelancers.find((f) => f.id === id && !f.deletedAt);
      if (!x) throw new ApiError(404, "Freelancer não encontrado.");
      const canBank = access(me, "freelancerBank") === "T" || id === myFl;
      const money = canSeeMoney(me) || id === myFl;
      const members = db.projectMembers.filter((m) => m.freelancerId === id && !m.deletedAt);
      return {
        ...maskFreelancer(x, canBank),
        canSeeBank: canBank,
        projects: members.map((m) => {
          const p = db.projects.find((pp) => pp.id === m.projectId)!;
          return { ...toListItem(db, p, me), memberRole: m.memberRole, memberActive: m.active, agreedAmountCents: money ? m.agreedAmountCents : null };
        }),
        openTasks: db.tasks
          .filter((t) => t.assigneeFreelancerId === id && t.statusKey !== "concluida" && !t.deletedAt)
          .map((t) => ({ ...t, projectCode: db.projects.find((p) => p.id === t.projectId)?.code ?? "" })),
        deliveries: db.fileVersions
          .filter((v) => db.files.find((f) => f.id === v.fileId)?.category === "entrega" && v.uploadedBy === x.userId)
          .map((v) => ({ ...v, fileName: db.files.find((f) => f.id === v.fileId)!.name })),
        payables: money
          ? db.payables.filter((p) => p.freelancerId === id && !p.deletedAt).map((p) => ({ ...p, projectCode: db.projects.find((pp) => pp.id === p.projectId)?.code ?? "" }))
          : [],
      };
    }),

  create: (input: FreelancerInput) =>
    write((db, me) => {
      if (!canWriteAll(me, "freelancers")) throw new ApiError(403, "Sem permissão.");
      validateFreelancer(input);
      if (db.freelancers.some((f) => !f.deletedAt && f.email.toLowerCase() === input.email.toLowerCase())) throw new ApiError(409, "Já existe um freelancer com este e-mail.", { email: "E-mail já cadastrado" });
      const f: Freelancer = {
        ...baseFields(me.id),
        userId: null,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone ?? null,
        legalName: input.legalName ?? null,
        document: input.document ?? null,
        pixKey: input.pixKey ?? null,
        bankName: input.bankName ?? null,
        bankAgency: input.bankAgency ?? null,
        bankAccount: input.bankAccount ?? null,
        jobTitle: input.jobTitle?.trim() || null,
        specialties: input.specialties,
        status: input.status,
        notes: input.notes ?? null,
        avatarColor: COLORS[db.freelancers.length % COLORS.length],
      };
      db.freelancers.push(f);
      emit(db, me, { type: "freelancer.created", entityType: "freelancer", entityId: f.id, data: { name: f.name } });
      return f;
    }),

  update: (id: ID, input: FreelancerInput) =>
    write((db, me) => {
      const myFl = freelancerIdOf(db, me);
      if (!canWriteAll(me, "freelancers") && id !== myFl) throw new ApiError(403, "Sem permissão.");
      const f = db.freelancers.find((x) => x.id === id);
      if (!f) throw new ApiError(404, "Freelancer não encontrado.");
      validateFreelancer(input);
      const canBank = access(me, "freelancerBank") === "T" || id === myFl;
      const patch = { ...input, jobTitle: input.jobTitle?.trim() || null };
      if (!canBank) {
        delete patch.document;
        delete patch.pixKey;
        delete patch.bankName;
        delete patch.bankAgency;
        delete patch.bankAccount;
      }
      Object.assign(f, patch);
      touch(f);
      emit(db, me, { type: "freelancer.updated", entityType: "freelancer", entityId: f.id, data: {} });
      return f;
    }),

  /** Convite de acesso do freelancer: mesmo convite de Usuários (RN-32 — token aleatório, 7 dias, uso único, e-mail transacional). */
  invite: async (id: ID) => {
    const userId = await write((db, me) => {
      if (!canWriteAll(me, "users")) throw new ApiError(403, "Só administradores convidam usuários.");
      const f = db.freelancers.find((x) => x.id === id);
      if (!f) throw new ApiError(404, "Freelancer não encontrado.");
      if (f.userId) throw new ApiError(409, "Este freelancer já tem acesso.");
      if (db.users.some((u) => u.email.toLowerCase() === f.email.toLowerCase())) throw new ApiError(409, "Já existe um usuário com o e-mail deste freelancer.");
      const u = { ...baseFields(me.id), email: f.email, name: f.name, userType: "freelancer" as const, role: "freelancer" as const, status: "convidado" as const, avatarColor: f.avatarColor, jobTitle: "Freelancer", phone: f.phone, mfaEnabled: false, lastLoginAt: null, passwordMock: "" };
      db.users.push(u);
      f.userId = u.id;
      emit(db, me, { type: "user.invited", entityType: "user", entityId: u.id, data: { email: u.email, role: "freelancer" } });
      return u.id;
    });
    return issueUserInvite(userId, { email: true });
  },
};

function validateFreelancer(input: FreelancerInput) {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Informe o nome";
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) errors.email = "Informe um e-mail válido, ex.: nome@gmail.com";
  if (!input.specialties.length) errors.specialties = "Escolha ao menos uma especialidade";
  if (!input.jobTitle?.trim()) errors.jobTitle = "Informe o cargo, ex.: Designer gráfico";
  if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
}

export const projectTypesApi = {
  list: (includeInactive = false) =>
    read((db) =>
      db.projectTypes
        .filter((t) => !t.deletedAt && (includeInactive || t.active))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({
          ...t,
          templates: db.projectTypeTaskTemplates.filter((x) => x.projectTypeId === t.id && !x.deletedAt).sort((a, b) => a.order - b.order),
          projectsCount: db.projects.filter((p) => p.projectTypeId === t.id && !p.deletedAt).length,
        })),
    ),

  save: (input: { name: string; codePrefix: string; description?: string | null; icon: string; active: boolean; templates: { stageKey: ProjectStageKey; title: string; defaultDurationDays: number }[] }, id?: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "settings")) throw new ApiError(403, "Só administradores mantêm o catálogo.");
      const prefix = input.codePrefix.trim().toUpperCase();
      const errors: Record<string, string> = {};
      if (!input.name.trim()) errors.name = "Informe o nome";
      if (!/^[A-Z]{2,5}$/.test(prefix)) errors.codePrefix = "Use de 2 a 5 letras, ex.: MEM";
      if (db.projectTypes.some((t) => t.id !== id && !t.deletedAt && t.codePrefix === prefix)) errors.codePrefix = "Prefixo já usado por outro tipo";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      let t: ProjectType;
      if (id) {
        t = db.projectTypes.find((x) => x.id === id)!;
        const hasProjects = db.projects.some((p) => p.projectTypeId === id);
        if (hasProjects && t.codePrefix !== prefix) throw new ApiError(409, "O prefixo não pode mudar depois que há projetos com este tipo (RN-05).", { codePrefix: "Prefixo travado: já existem projetos" });
        Object.assign(t, { name: input.name.trim(), codePrefix: prefix, description: input.description ?? null, icon: input.icon, active: input.active });
        touch(t);
      } else {
        t = { ...baseFields(me.id), name: input.name.trim(), codePrefix: prefix, description: input.description ?? null, icon: input.icon, active: input.active };
        db.projectTypes.push(t);
      }
      const now = nowIso();
      db.projectTypeTaskTemplates.filter((x) => x.projectTypeId === t.id && !x.deletedAt).forEach((x) => (x.deletedAt = now));
      input.templates.forEach((tpl, i) => db.projectTypeTaskTemplates.push({ ...baseFields(me.id), projectTypeId: t.id, stageKey: tpl.stageKey, title: tpl.title, order: i + 1, defaultDurationDays: tpl.defaultDurationDays }));
      emit(db, me, { type: id ? "project_type.updated" : "project_type.created", entityType: "project_type", entityId: t.id, data: { name: t.name } });
      return t;
    }),
};
