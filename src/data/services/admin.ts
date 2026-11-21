/** Administrativo (M6), usuários e autenticação (M1), e-mail (M11), importação, busca. */
import { baseFields, loadDb, nowIso, resetDb, transaction } from "../db";
import type { ID, ImportKind, InstitutionalDocument, MailAccount, Resource, Role, SystemMailSettings, VaultItem } from "../types";
import { ApiError, actor, assertProjectVisible, emit, getSessionUserId, latency, read, setSessionUserId, touch, visibleProjects, write } from "./_core";
import { access, canRead, canWriteAll } from "@/lib/permissions";
import { isValidCnpj, onlyDigits } from "@/lib/format";

/* ───────── Autenticação (mock) ───────── */
const failures = new Map<string, number>();

export const authApi = {
  me: async () => {
    await latency(30);
    const db = loadDb();
    const id = getSessionUserId();
    const u = id ? db.users.find((x) => x.id === id && x.status === "ativo") : null;
    if (!u) return null;
    const { passwordMock: _pw, ...safe } = u;
    void _pw;
    return { ...safe, freelancerId: db.freelancers.find((f) => f.userId === u.id)?.id ?? null };
  },

  /** RF-M1-01 / RNF-01 — bloqueio progressivo após falhas. */
  login: async (email: string, password: string) => {
    await latency(500);
    const key = email.trim().toLowerCase();
    const fails = failures.get(key) ?? 0;
    if (fails >= 5) throw new ApiError(429 as 403, "Muitas tentativas. Aguarde alguns minutos ou recupere a senha.");
    return transaction((db) => {
      const u = db.users.find((x) => x.email.toLowerCase() === key);
      if (!u || u.passwordMock !== password || u.status !== "ativo") {
        failures.set(key, fails + 1);
        db.accessLogs.push({ ...baseFields(null), userId: u?.id ?? null, action: "login_failed", detail: key, at: nowIso() });
        if (u?.status === "inativo") throw new ApiError(403, "Este usuário está inativo. Fale com a administração.");
        throw new ApiError(401, "E-mail ou senha incorretos.");
      }
      failures.delete(key);
      u.lastLoginAt = nowIso();
      db.accessLogs.push({ ...baseFields(u.id), userId: u.id, action: "login", detail: null, at: nowIso() });
      setSessionUserId(u.id);
      return { id: u.id, mfaRequired: u.mfaEnabled };
    });
  },

  verifyMfa: async (code: string) => {
    await latency(300);
    if (!/^\d{6}$/.test(code)) throw new ApiError(422, "Digite os 6 números do aplicativo autenticador.", { code: "Digite os 6 números" });
    return true;
  },

  logout: async () => {
    await latency(80);
    const id = getSessionUserId();
    if (id) transaction((db) => db.accessLogs.push({ ...baseFields(id), userId: id, action: "logout", detail: null, at: nowIso() }));
    setSessionUserId(null);
  },

  /** Troca de perfil para demonstração (só no mock). */
  impersonate: async (userId: ID) => {
    await latency(80);
    setSessionUserId(userId);
  },

  requestPasswordReset: async (email: string) => {
    await latency(500);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new ApiError(422, "Informe um e-mail válido.", { email: "Informe um e-mail válido" });
    transaction((db) => {
      const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (u) db.emailLogs.push({ ...baseFields(null), channel: "system", provider: "brevo", userId: null, projectId: null, to: [u.email], cc: [], subject: "Recuperação de senha", template: "recuperar_senha", status: "sent", error: null, sentAt: nowIso() });
    });
    return true; // nunca revela se o e-mail existe
  },

  resetPassword: async (token: string, password: string) => {
    await latency(400);
    if (password.length < 8) throw new ApiError(422, "A senha precisa de pelo menos 8 caracteres.", { password: "Use pelo menos 8 caracteres" });
    if (!token) throw new ApiError(409, "Link inválido ou expirado.");
    return true;
  },

  /** RF-M1-02 — aceite de convite. */
  getInvite: async (token: string) => {
    await latency(200);
    const db = loadDb();
    const u = db.users.find((x) => x.status === "convidado" && (x.id === token || `convite-${x.id}` === token));
    if (!u) throw new ApiError(404, "Convite inválido ou já utilizado.");
    return { name: u.name, email: u.email, role: u.role };
  },

  acceptInvite: async (token: string, input: { name: string; password: string }) => {
    await latency(500);
    if (input.password.length < 8) throw new ApiError(422, "A senha precisa de pelo menos 8 caracteres.", { password: "Use pelo menos 8 caracteres" });
    return transaction((db) => {
      const u = db.users.find((x) => x.status === "convidado" && (x.id === token || `convite-${x.id}` === token));
      if (!u) throw new ApiError(404, "Convite inválido ou já utilizado.");
      u.name = input.name.trim() || u.name;
      u.passwordMock = input.password;
      u.status = "ativo";
      u.lastLoginAt = nowIso();
      touch(u);
      setSessionUserId(u.id);
      return u.id;
    });
  },

  resetDemo: async () => {
    await latency(300);
    const id = getSessionUserId();
    resetDb();
    setSessionUserId(id);
  },
};

/* ───────── Usuários (RF-M1-02/03) ───────── */
export const usersApi = {
  list: (f: { q?: string; role?: Role; status?: string; includeFreelancers?: boolean } = {}) =>
    read((db) => {
      const q = f.q?.trim().toLowerCase();
      return db.users
        .filter((u) => !u.deletedAt)
        .filter((u) => f.includeFreelancers !== false || u.userType !== "freelancer")
        .filter((u) => !f.role || u.role === f.role)
        .filter((u) => !f.status || u.status === f.status)
        .filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ passwordMock: _pw, ...u }) => {
          void _pw;
          return { ...u, inviteToken: u.status === "convidado" ? `convite-${u.id}` : null };
        });
    }, 100),

  invite: (input: { name: string; email: string; role: Role }) =>
    write((db, me) => {
      if (!canWriteAll(me, "users")) throw new ApiError(403, "Só administradores convidam usuários.");
      const email = input.email.trim().toLowerCase();
      const errors: Record<string, string> = {};
      if (!input.name.trim()) errors.name = "Informe o nome";
      if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Informe um e-mail válido";
      if (db.users.some((u) => u.email.toLowerCase() === email)) errors.email = "Já existe um usuário com este e-mail";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const u = { ...baseFields(me.id), email, name: input.name.trim(), userType: input.role === "freelancer" ? ("freelancer" as const) : ("internal" as const), role: input.role, status: "convidado" as const, avatarColor: ["#3f76ff", "#0fa37f", "#d97706", "#db2777", "#7c3aed"][db.users.length % 5], jobTitle: null, phone: null, mfaEnabled: false, lastLoginAt: null, passwordMock: "" };
      db.users.push(u);
      db.emailLogs.push({ ...baseFields(null), channel: "system", provider: "brevo", userId: null, projectId: null, to: [email], cc: [], subject: "Convite para a plataforma Draw", template: "convite", status: "sent", error: null, sentAt: nowIso() });
      emit(db, me, { type: "user.invited", entityType: "user", entityId: u.id, data: { email, role: input.role } });
      return { id: u.id, inviteToken: `convite-${u.id}` };
    }),

  update: (id: ID, patch: { name?: string; role?: Role; jobTitle?: string | null; phone?: string | null }) =>
    write((db, me) => {
      if (!canWriteAll(me, "users") && id !== me.id) throw new ApiError(403, "Sem permissão.");
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new ApiError(404, "Usuário não encontrado.");
      if (patch.role && id === me.id && patch.role !== "admin" && me.role === "admin" && db.users.filter((x) => x.role === "admin" && x.status === "ativo").length === 1) throw new ApiError(409, "Você é o único administrador. Promova outra pessoa antes.");
      if (patch.role && !canWriteAll(me, "users")) delete patch.role;
      const before = u.role;
      Object.assign(u, patch);
      touch(u);
      if (patch.role && patch.role !== before) emit(db, me, { type: "user.role_changed", entityType: "user", entityId: u.id, data: { from: before, to: patch.role } });
      return u.id;
    }),

  setStatus: (id: ID, status: "ativo" | "inativo") =>
    write((db, me) => {
      if (!canWriteAll(me, "users")) throw new ApiError(403, "Sem permissão.");
      if (id === me.id) throw new ApiError(409, "Você não pode inativar a si mesmo.");
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new ApiError(404, "Usuário não encontrado.");
      u.status = status;
      touch(u);
      emit(db, me, { type: status === "inativo" ? "user.deactivated" : "user.reactivated", entityType: "user", entityId: u.id, data: {} });
    }),

  resendInvite: (id: ID) =>
    write((db, me) => {
      const u = db.users.find((x) => x.id === id && x.status === "convidado");
      if (!u) throw new ApiError(404, "Convite não encontrado.");
      db.emailLogs.push({ ...baseFields(null), channel: "system", provider: "brevo", userId: null, projectId: null, to: [u.email], cc: [], subject: "Convite para a plataforma Draw", template: "convite", status: "sent", error: null, sentAt: nowIso() });
      emit(db, me, { type: "user.invite_resent", entityType: "user", entityId: u.id, data: {} });
    }),

  setMfa: (enabled: boolean) =>
    write((db, me) => {
      const u = db.users.find((x) => x.id === me.id)!;
      if (!enabled && u.role === "admin") throw new ApiError(409, "O 2FA é obrigatório para administradores.");
      u.mfaEnabled = enabled;
      touch(u);
    }),

  changePassword: (current: string, next: string) =>
    write((db, me) => {
      const u = db.users.find((x) => x.id === me.id)!;
      if (u.passwordMock !== current) throw new ApiError(422, "Senha atual incorreta.", { current: "Senha atual incorreta" });
      if (next.length < 8) throw new ApiError(422, "Use pelo menos 8 caracteres.", { next: "Use pelo menos 8 caracteres" });
      u.passwordMock = next;
      touch(u);
    }),

  accessLogs: () =>
    read((db, me) => {
      if (!canWriteAll(me, "users")) throw new ApiError(403, "Sem permissão.");
      return db.accessLogs.slice(-100).reverse().map((l) => ({ ...l, userName: db.users.find((u) => u.id === l.userId)?.name ?? l.detail ?? "—" }));
    }),

  organization: () => read((db) => ({ org: db.organizations[0], flags: db.featureFlags })),

  updateOrganization: (settings: { freelancerPaymentDay: number; dueSoonDays: number }) =>
    write((db, me) => {
      if (!canWriteAll(me, "settings")) throw new ApiError(403, "Sem permissão.");
      if (settings.freelancerPaymentDay < 1 || settings.freelancerPaymentDay > 28) throw new ApiError(422, "Escolha um dia entre 1 e 28.", { freelancerPaymentDay: "Escolha um dia entre 1 e 28" });
      db.organizations[0].settings = settings;
      emit(db, me, { type: "organization.settings_changed", entityType: "organization", entityId: db.organizations[0].id, data: settings });
    }),
};

/* ───────── Administrativo ───────── */
export const admApi = {
  documents: () =>
    read((db, me) => {
      if (!canRead(me, "adm")) throw new ApiError(403, "Sem acesso.");
      return db.institutionalDocuments.filter((d) => !d.deletedAt).sort((a, b) => (a.validUntil ?? "9999").localeCompare(b.validUntil ?? "9999")).map((d) => {
        const f = db.files.find((x) => x.id === d.fileId);
        return { ...d, file: f ?? null, currentVersion: f ? db.fileVersions.find((v) => v.id === f.currentVersionId) ?? null : null };
      });
    }),
  saveDocument: (input: { title: string; category: InstitutionalDocument["category"]; validUntil: string | null; fileId?: ID | null }, id?: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      if (!input.title.trim()) throw new ApiError(422, "Informe o título.", { title: "Informe o título" });
      if (id) {
        const d = db.institutionalDocuments.find((x) => x.id === id)!;
        Object.assign(d, { ...input, fileId: input.fileId ?? d.fileId });
        touch(d);
        return d;
      }
      const d: InstitutionalDocument = { ...baseFields(me.id), title: input.title.trim(), category: input.category, validUntil: input.validUntil, fileId: input.fileId ?? null };
      db.institutionalDocuments.push(d);
      return d;
    }),
  removeDocument: (id: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      const d = db.institutionalDocuments.find((x) => x.id === id);
      if (d) d.deletedAt = nowIso();
    }),

  /** RF-M6-03 — segredo nunca vem na listagem; só via `reveal`, que gera log. */
  vault: () =>
    read((db, me) => {
      if (access(me, "vault") === "-") throw new ApiError(403, "Sem acesso ao cofre.");
      return db.vaultItems
        .filter((v) => !v.deletedAt && (me.role === "admin" || v.allowedRoles.includes(me.role)))
        .map(({ secret: _s, ...v }) => {
          void _s;
          return { ...v, lastAccess: db.vaultAccessLogs.filter((l) => l.vaultItemId === v.id).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null };
        });
    }),
  reveal: (id: ID, action: "revelar" | "copiar") =>
    write((db, me) => {
      const v = db.vaultItems.find((x) => x.id === id && !x.deletedAt);
      if (!v || (me.role !== "admin" && !v.allowedRoles.includes(me.role))) throw new ApiError(404, "Item não encontrado.");
      db.vaultAccessLogs.push({ ...baseFields(me.id), vaultItemId: v.id, userId: me.id, action, at: nowIso() });
      db.accessLogs.push({ ...baseFields(me.id), userId: me.id, action: "secret_revealed", detail: v.title, at: nowIso() });
      return v.secret;
    }, 120),
  saveVaultItem: (input: { title: string; url?: string | null; username?: string | null; secret?: string; notes?: string | null; allowedRoles: Role[] }, id?: ID) =>
    write((db, me) => {
      if (me.role !== "admin") throw new ApiError(403, "Só administradores gerenciam o cofre.");
      if (!input.title.trim()) throw new ApiError(422, "Informe o título.", { title: "Informe o título" });
      if (id) {
        const v = db.vaultItems.find((x) => x.id === id)!;
        Object.assign(v, { ...input, secret: input.secret || v.secret });
        touch(v);
        db.vaultAccessLogs.push({ ...baseFields(me.id), vaultItemId: v.id, userId: me.id, action: "editar", at: nowIso() });
        return v.id;
      }
      if (!input.secret) throw new ApiError(422, "Informe a senha.", { secret: "Informe a senha" });
      const v: VaultItem = { ...baseFields(me.id), title: input.title.trim(), url: input.url ?? null, username: input.username ?? null, secret: input.secret, notes: input.notes ?? null, allowedRoles: input.allowedRoles };
      db.vaultItems.push(v);
      return v.id;
    }),
  removeVaultItem: (id: ID) =>
    write((db, me) => {
      if (me.role !== "admin") throw new ApiError(403, "Sem permissão.");
      const v = db.vaultItems.find((x) => x.id === id);
      if (v) v.deletedAt = nowIso();
    }),
  vaultLogs: (id?: ID) =>
    read((db) => db.vaultAccessLogs.filter((l) => !id || l.vaultItemId === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100).map((l) => ({ ...l, userName: db.users.find((u) => u.id === l.userId)?.name ?? "—", itemTitle: db.vaultItems.find((v) => v.id === l.vaultItemId)?.title ?? "—" }))),

  resources: () => read((db) => db.resources.filter((r) => !r.deletedAt).sort((a, b) => a.title.localeCompare(b.title))),
  saveResource: (input: Pick<Resource, "title" | "url" | "category" | "description">, id?: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      const errors: Record<string, string> = {};
      if (!input.title.trim()) errors.title = "Informe o título";
      if (!/^https?:\/\//.test(input.url)) errors.url = "Use um link completo, começando com https://";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      if (id) {
        const r = db.resources.find((x) => x.id === id)!;
        Object.assign(r, input);
        touch(r);
        return r;
      }
      const r: Resource = { ...baseFields(me.id), ...input };
      db.resources.push(r);
      return r;
    }),
  removeResource: (id: ID) =>
    write((db, me) => {
      if (!canWriteAll(me, "adm")) throw new ApiError(403, "Sem permissão.");
      const r = db.resources.find((x) => x.id === id);
      if (r) r.deletedAt = nowIso();
    }),
};

/* ───────── E-mail (M11) ───────── */
export const mailApi = {
  systemSettings: () =>
    read((db, me) => {
      if (!canRead(me, "settings")) throw new ApiError(403, "Sem permissão.");
      const usage = db.emailLogs.filter((l) => l.channel === "system" && l.sentAt?.slice(0, 10) === new Date().toISOString().slice(0, 10));
      return { settings: db.systemMailSettings[0], usage: { brevo: usage.filter((u) => u.provider === "brevo").length, resend: usage.filter((u) => u.provider === "resend").length, brevoQuota: 300, resendQuota: 100 }, recent: db.emailLogs.filter((l) => l.channel === "system").sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? "")).slice(0, 20) };
    }),
  saveSystemSettings: (input: Omit<SystemMailSettings, keyof ReturnType<typeof baseFields> | "smtpPasswordSet"> & { smtpPassword?: string }) =>
    write((db, me) => {
      if (!canWriteAll(me, "settings")) throw new ApiError(403, "Só administradores alteram o e-mail do sistema.");
      const errors: Record<string, string> = {};
      if (input.transport === "draw_smtp") {
        if (!input.smtpHost?.trim()) errors.smtpHost = "Informe o servidor SMTP";
        if (!input.smtpPort || input.smtpPort < 1) errors.smtpPort = "Informe a porta (ex.: 587)";
        if (!input.smtpUser?.trim()) errors.smtpUser = "Informe o usuário";
        if (!db.systemMailSettings[0].smtpPasswordSet && !input.smtpPassword) errors.smtpPassword = "Informe a senha";
      }
      if (!/^\S+@\S+\.\S+$/.test(input.fromAddress)) errors.fromAddress = "Informe um remetente válido";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const s = db.systemMailSettings[0];
      const { smtpPassword, ...rest } = input;
      Object.assign(s, rest, { smtpPasswordSet: s.smtpPasswordSet || !!smtpPassword });
      touch(s);
      emit(db, me, { type: "mail.system_settings_changed", entityType: "system_mail_settings", entityId: s.id, data: { transport: s.transport } });
      return s;
    }),
  sendSystemTest: (to: string) =>
    write((db) => {
      const s = db.systemMailSettings[0];
      if (s.transport === "draw_smtp" && !s.smtpHost) throw new ApiError(422, "Salve a configuração SMTP antes de testar.");
      db.emailLogs.push({ ...baseFields(null), channel: "system", provider: s.transport === "draw_smtp" ? "draw_smtp" : "brevo", userId: null, projectId: null, to: [to], cc: [], subject: "E-mail de teste da plataforma Draw", template: "teste", status: "delivered", error: null, sentAt: nowIso() });
      return true;
    }, 900),

  myAccount: () =>
    read((db, me) => ({
      account: db.mailAccounts.find((a) => a.userId === me.id && !a.deletedAt) ?? null,
      signature: db.mailSignatures.find((s) => s.userId === me.id)?.html ?? "",
      canUse: me.role !== "freelancer",
    })),
  connect: (input: { kind: MailAccount["kind"]; address: string; displayName: string; smtpHost?: string; smtpPort?: number; smtpSecurity?: "starttls" | "ssl"; smtpUser?: string; smtpPassword?: string }) =>
    write((db, me) => {
      if (me.role === "freelancer") throw new ApiError(403, "Freelancers não conectam caixa de e-mail (RF-M11-06).");
      const errors: Record<string, string> = {};
      if (!/^\S+@\S+\.\S+$/.test(input.address)) errors.address = "Informe um e-mail válido";
      if (input.kind === "smtp") {
        if (!input.smtpHost) errors.smtpHost = "Informe o servidor SMTP";
        if (!input.smtpUser) errors.smtpUser = "Informe o usuário";
        if (!input.smtpPassword) errors.smtpPassword = "Informe a senha de app";
      }
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      db.mailAccounts.filter((a) => a.userId === me.id).forEach((a) => (a.deletedAt = nowIso()));
      const acc: MailAccount = { ...baseFields(me.id), userId: me.id, kind: input.kind, address: input.address, displayName: input.displayName || me.name, smtpHost: input.smtpHost ?? null, smtpPort: input.smtpPort ?? null, smtpSecurity: input.smtpSecurity ?? null, smtpUser: input.smtpUser ?? null, status: "connected", lastCheckedAt: nowIso() };
      db.mailAccounts.push(acc);
      return acc;
    }, 900),
  disconnect: () =>
    write((db, me) => {
      db.mailAccounts.filter((a) => a.userId === me.id && !a.deletedAt).forEach((a) => (a.deletedAt = nowIso()));
    }),
  testMyAccount: () =>
    write((db, me) => {
      const a = db.mailAccounts.find((x) => x.userId === me.id && !x.deletedAt);
      if (!a) throw new ApiError(409, "Conecte sua caixa primeiro.");
      a.lastCheckedAt = nowIso();
      a.status = "connected";
      return true;
    }, 800),
  saveSignature: (html: string) =>
    write((db, me) => {
      const s = db.mailSignatures.find((x) => x.userId === me.id);
      if (s) {
        s.html = html;
        touch(s);
      } else db.mailSignatures.push({ ...baseFields(me.id), userId: me.id, html });
    }),

  projectEmails: (projectId: ID) =>
    read((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      return db.projectEmails
        .filter((e) => e.projectId === p.id && !e.deletedAt)
        .map((e) => {
          const log = db.emailLogs.find((l) => l.id === e.emailLogId)!;
          return { ...e, log, senderName: db.users.find((u) => u.id === e.senderUserId)?.name ?? "—", attachmentsInfo: e.attachments.map((vid) => { const v = db.fileVersions.find((x) => x.id === vid); const f = v ? db.files.find((x) => x.id === v.fileId) : null; return { versionId: vid, name: f?.name ?? "arquivo", version: v?.version ?? 1 }; }) };
        })
        .sort((a, b) => (b.log.sentAt ?? "").localeCompare(a.log.sentAt ?? ""));
    }),
  /** RF-M11-03/05/07 — envia pela caixa do usuário e registra no projeto. */
  sendProjectEmail: (projectId: ID, input: { to: string[]; cc: string[]; subject: string; bodyHtml: string; attachments: ID[]; template?: string | null }) =>
    write((db, me) => {
      const p = assertProjectVisible(db, me, projectId);
      const acc = db.mailAccounts.find((a) => a.userId === me.id && !a.deletedAt && a.status === "connected");
      if (!acc) throw new ApiError(409, "Conecte sua caixa de e-mail em Minha conta → E-mail para enviar.");
      const errors: Record<string, string> = {};
      if (!input.to.length) errors.to = "Adicione ao menos um destinatário";
      if (input.to.concat(input.cc).some((e) => !/^\S+@\S+\.\S+$/.test(e))) errors.to = "Há um e-mail inválido entre os destinatários";
      if (!input.subject.trim()) errors.subject = "Escreva o assunto";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const sig = db.mailSignatures.find((s) => s.userId === me.id)?.html ?? "";
      const log = { ...baseFields(me.id), channel: "user" as const, provider: acc.kind === "gmail_oauth" ? ("gmail_api" as const) : ("user_smtp" as const), userId: me.id, projectId: p.id, to: input.to, cc: input.cc, subject: input.subject.trim(), template: input.template ?? null, status: "sent" as const, error: null, sentAt: nowIso() };
      db.emailLogs.push(log);
      db.projectEmails.push({ ...baseFields(me.id), projectId: p.id, emailLogId: log.id, senderUserId: me.id, bodyHtml: input.bodyHtml + (sig ? `<br/>${sig}` : ""), attachments: input.attachments });
      emit(db, me, { type: "email.sent", entityType: "email", entityId: log.id, project: p, data: { subject: log.subject, to: input.to } });
      return log.id;
    }, 700),
};

/* ───────── Importação (RF-M5-08) ───────── */
type Row = Record<string, string>;
export const importsApi = {
  list: () => read((db) => db.imports.filter((i) => !i.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
  /** Dry run: valida linha a linha sem gravar. */
  preview: (kind: ImportKind, rows: Row[]) =>
    read((db) => {
      const errors: { line: number; message: string }[] = [];
      rows.forEach((r, i) => {
        const line = i + 2;
        if (kind === "clientes") {
          if (!r.razao_social?.trim()) errors.push({ line, message: "Razão social vazia" });
          if (!isValidCnpj(r.cnpj ?? "")) errors.push({ line, message: `CNPJ inválido: ${r.cnpj ?? "(vazio)"}` });
          else if (db.clients.some((c) => onlyDigits(c.cnpj) === onlyDigits(r.cnpj))) errors.push({ line, message: `CNPJ já cadastrado: ${r.cnpj} (será atualizado)` });
        } else if (kind === "freelancers") {
          if (!r.nome?.trim()) errors.push({ line, message: "Nome vazio" });
          if (!/^\S+@\S+\.\S+$/.test(r.email ?? "")) errors.push({ line, message: `E-mail inválido: ${r.email ?? "(vazio)"}` });
        } else {
          if (!r.codigo_projeto?.trim()) errors.push({ line, message: "Código do projeto vazio" });
          else if (!db.projects.some((p) => p.code === r.codigo_projeto.trim().toUpperCase())) errors.push({ line, message: `Projeto não encontrado: ${r.codigo_projeto}` });
          if (!r.valor || Number.isNaN(Number(r.valor.replace(/\./g, "").replace(",", ".")))) errors.push({ line, message: `Valor inválido: ${r.valor ?? "(vazio)"}` });
        }
      });
      const blocking = new Set(errors.filter((e) => !e.message.includes("será atualizado")).map((e) => e.line));
      return { total: rows.length, ok: rows.length - blocking.size, errors };
    }, 500),
  commit: (kind: ImportKind, fileName: string, rows: Row[], report: { total: number; ok: number; errors: { line: number; message: string }[] }) =>
    write((db, me) => {
      if (!canWriteAll(me, kind === "clientes" ? "clients" : kind === "freelancers" ? "freelancers" : "receivables")) throw new ApiError(403, "Sem permissão para importar.");
      const blocking = new Set(report.errors.filter((e) => !e.message.includes("será atualizado")).map((e) => e.line));
      let imported = 0;
      rows.forEach((r, i) => {
        if (blocking.has(i + 2)) return;
        if (kind === "clientes") {
          const existing = db.clients.find((c) => onlyDigits(c.cnpj) === onlyDigits(r.cnpj));
          if (existing) Object.assign(existing, { legalName: r.razao_social, tradeName: r.nome_fantasia || existing.tradeName, segment: r.segmento || existing.segment });
          else db.clients.push({ ...baseFields(me.id), groupId: null, legalName: r.razao_social, tradeName: r.nome_fantasia || r.razao_social, cnpj: r.cnpj, address: { street: "", number: "", complement: null, district: "", city: r.cidade ?? "", state: r.uf ?? "", zip: "" }, segment: r.segmento || "Outros", status: "ativo", notes: "Importado por planilha" });
        } else if (kind === "freelancers") {
          if (!db.freelancers.some((f) => f.email === r.email.toLowerCase())) db.freelancers.push({ ...baseFields(me.id), userId: null, name: r.nome, email: r.email.toLowerCase(), phone: r.telefone ?? null, legalName: null, document: null, pixKey: r.pix ?? null, bankName: null, bankAgency: null, bankAccount: null, specialties: [(r.especialidade as "design") || "outro"], status: "ativo", notes: "Importado por planilha", avatarColor: "#0891b2" });
        } else if (kind === "recebiveis") {
          const p = db.projects.find((x) => x.code === r.codigo_projeto.trim().toUpperCase())!;
          db.receivables.push({ ...baseFields(me.id), projectId: p.id, clientId: p.clientId, proposalInstallmentId: null, description: r.descricao || "Importado", amountCents: Math.round(Number(r.valor.replace(/\./g, "").replace(",", ".")) * 100), taxCents: 0, expectedAt: r.vencimento ? new Date(r.vencimento).toISOString() : nowIso(), invoiceNumber: null, invoiceFileId: null, issuedAt: null, receivedAt: null, status: "previsto" });
        }
        imported++;
      });
      const job = { ...baseFields(me.id), kind, sourceFileName: fileName, status: "concluida" as const, dryRun: false, report: { ...report, ok: imported } };
      db.imports.push(job);
      emit(db, me, { type: "import.completed", entityType: "import", entityId: job.id, data: { kind, imported } });
      return job;
    }, 800),
};

/* ───────── Busca global (RF-X-01) ───────── */
export const searchApi = {
  query: (q: string) =>
    read((db, me) => {
      const term = q.trim().toLowerCase();
      if (term.length < 2) return { projects: [], clients: [], freelancers: [], tasks: [] };
      const projects = visibleProjects(db, me);
      const projectIds = new Set(projects.map((p) => p.id));
      return {
        projects: projects.filter((p) => `${p.code} ${p.title}`.toLowerCase().includes(term)).slice(0, 6).map((p) => ({ id: p.id, code: p.code, title: p.title, status: p.status, clientName: db.clients.find((c) => c.id === p.clientId)?.tradeName ?? "" })),
        clients: canRead(me, "clients") ? db.clients.filter((c) => !c.deletedAt && `${c.tradeName} ${c.legalName} ${c.cnpj}`.toLowerCase().includes(term)).slice(0, 5).map((c) => ({ id: c.id, name: c.tradeName, cnpj: c.cnpj })) : [],
        freelancers: canRead(me, "freelancers") && me.role !== "freelancer" ? db.freelancers.filter((f) => !f.deletedAt && f.name.toLowerCase().includes(term)).slice(0, 5).map((f) => ({ id: f.id, name: f.name, color: f.avatarColor })) : [],
        tasks: db.tasks.filter((t) => !t.deletedAt && (!t.projectId || projectIds.has(t.projectId)) && (t.module !== "adm" || canRead(me, "adm")) && t.title.toLowerCase().includes(term)).slice(0, 6).map((t) => ({ id: t.id, title: t.title, projectCode: db.projects.find((p) => p.id === t.projectId)?.code ?? null, statusKey: t.statusKey })),
      };
    }, 80),
};

/** Lista leve de pessoas para seletores (responsável, equipe, menções). */
export const peopleApi = {
  internal: () => read((db) => db.users.filter((u) => u.status === "ativo" && u.userType === "internal").map((u) => ({ id: u.id, name: u.name, color: u.avatarColor, role: u.role, email: u.email })), 60),
  all: () =>
    read((db) => [
      ...db.users.filter((u) => u.status === "ativo" && u.userType === "internal").map((u) => ({ kind: "user" as const, id: u.id, name: u.name, color: u.avatarColor, sub: u.jobTitle ?? "" })),
      ...db.freelancers.filter((f) => f.status === "ativo" && !f.deletedAt).map((f) => ({ kind: "freelancer" as const, id: f.id, name: f.name, color: f.avatarColor, sub: "Freelancer" })),
    ], 60),
  current: () => read((_db, me) => me.id, 10),
};

export { actor };
