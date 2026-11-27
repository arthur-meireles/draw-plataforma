/** Administrativo (M6), usuários e autenticação (M1), e-mail (M11), importação, busca. */
import { baseFields, loadDb, nowIso, resetDb, transaction } from "../db";
import type { AccessLogAction, Database, ID, ImportKind, InstitutionalDocument, Resource, Role, SystemMailSettings, User, VaultItem } from "../types";
import { ApiError, actor, emit, getSessionUserId, latency, queueSystemEmail, read, requireAccess, secureToken, sessionUser, setSessionUserId, sha256Hex, taxOf, touch, visibleProjects, write } from "./_core";
import { ROLE_LABEL } from "../reference";
import { visibleTasks } from "./tasks";
import { access, canRead, canWriteAll } from "@/lib/permissions";
import { isDemoMode } from "@/lib/demo";
import { isValidCnpj, onlyDigits } from "@/lib/format";

/* ───────── Autenticação (mock) ───────── */
const failures = new Map<string, number>();

const MFA_CHALLENGE_TTL_MS = 5 * 60_000;
const RESET_TTL_MS = 60 * 60_000; // RN-31: 1 hora
const INVITE_TTL_MS = 7 * 86_400_000; // RN-32: 7 dias

/**
 * RN-30 — desafio pré-2FA. O login com senha correta NÃO cria sessão quando o usuário tem 2FA;
 * devolve um desafio de curta duração que só vira sessão em `verifyMfa`. No back-end: token
 * assinado de 5 minutos, sem cookie de sessão. Aqui fica em memória (sair da tela descarta).
 */
const mfaChallenges = new Map<string, { userId: ID; expiresAt: number }>();

const log = (db: Database, userId: ID | null, action: AccessLogAction, detail: string | null = null) =>
  db.accessLogs.push({ ...baseFields(userId), userId, action, detail, at: nowIso() });

const resetsOf = (db: Database) => (db.passwordResets ??= []);
const invitesOf = (db: Database) => (db.userInvites ??= []);

const safeUser = (u: User) => {
  const { passwordMock: _pw, ...rest } = u;
  void _pw;
  return rest;
};

/** RN-32 — emite um convite novo (revoga os pendentes) e registra o e-mail transacional. Devolve o token em claro uma única vez. */
export async function issueUserInvite(userId: ID, opts: { email: boolean; event?: string }) {
  const token = secureToken();
  const tokenHash = await sha256Hex(token);
  return write((db, me) => {
    requireAccess(me, "users", "all", "Só administradores convidam usuários e geram links de convite.");
    const u = db.users.find((x) => x.id === userId && x.status === "convidado" && !x.deletedAt);
    if (!u) throw new ApiError(404, "Convite não encontrado. A pessoa pode já ter aceitado.");
    const now = nowIso();
    invitesOf(db).filter((i) => i.userId === u.id && !i.usedAt && !i.revokedAt).forEach((i) => (i.revokedAt = now));
    invitesOf(db).push({ ...baseFields(me.id), userId: u.id, tokenHash, expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(), usedAt: null, revokedAt: null });
    if (opts.email) queueSystemEmail(db, { to: [u.email], subject: "Convite para a plataforma Draw", template: "convite" });
    if (opts.event) emit(db, me, { type: opts.event, entityType: "user", entityId: u.id, data: {} });
    return { id: u.id, inviteToken: token };
  }, 120);
}

/** Convite válido pelo token (hash, não expirado, não usado, não revogado) — RN-32. */
function findInvite(db: Database, tokenHash: string) {
  const inv = invitesOf(db).find((i) => i.tokenHash === tokenHash);
  if (!inv || inv.revokedAt || inv.usedAt) throw new ApiError(404, "Convite inválido ou já utilizado. Peça um novo convite à administração da Draw.");
  if (new Date(inv.expiresAt).getTime() < Date.now()) throw new ApiError(404, "Este convite expirou (vale 7 dias). Peça um novo convite à administração da Draw.");
  const u = db.users.find((x) => x.id === inv.userId && x.status === "convidado" && !x.deletedAt);
  if (!u) throw new ApiError(404, "Convite inválido ou já utilizado. Peça um novo convite à administração da Draw.");
  return { inv, u };
}

export const authApi = {
  me: async () => {
    await latency(30);
    const db = loadDb();
    const u = sessionUser(db);
    if (!u) return null;
    return { ...safeUser(u), freelancerId: db.freelancers.find((f) => f.userId === u.id)?.id ?? null };
  },

  /**
   * RF-M1-01 / RNF-01 — bloqueio progressivo após falhas.
   * RN-30 — com 2FA, devolve `mfaChallenge` e NÃO cria sessão; sem 2FA, entra direto.
   */
  login: async (email: string, password: string): Promise<{ id: ID; mfaRequired: false } | { id: ID; mfaRequired: true; mfaChallenge: string }> => {
    await latency(500);
    const key = email.trim().toLowerCase();
    const fails = failures.get(key) ?? 0;
    if (fails >= 5) throw new ApiError(429 as 403, "Muitas tentativas. Aguarde alguns minutos ou recupere a senha.");
    return transaction((db) => {
      const u = db.users.find((x) => x.email.toLowerCase() === key);
      if (!u || u.passwordMock !== password || u.status !== "ativo") {
        failures.set(key, fails + 1);
        log(db, u?.id ?? null, "login_failed", key);
        if (u?.status === "inativo") throw new ApiError(403, "Este usuário está inativo. Fale com a administração.");
        throw new ApiError(401, "E-mail ou senha incorretos.");
      }
      failures.delete(key);
      if (u.mfaEnabled) {
        const mfaChallenge = secureToken();
        mfaChallenges.set(mfaChallenge, { userId: u.id, expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS });
        setSessionUserId(null); // nenhuma sessão até o código ser confirmado
        return { id: u.id, mfaRequired: true as const, mfaChallenge };
      }
      u.lastLoginAt = nowIso();
      log(db, u.id, "login");
      setSessionUserId(u.id);
      return { id: u.id, mfaRequired: false as const };
    });
  },

  /** RN-30 — confirma o código do desafio e só então cria a sessão. Demonstração: qualquer 6 dígitos. */
  verifyMfa: async (mfaChallenge: string, code: string) => {
    await latency(300);
    const ch = mfaChallenges.get(mfaChallenge);
    if (!ch || ch.expiresAt < Date.now()) {
      mfaChallenges.delete(mfaChallenge);
      throw new ApiError(401, "A verificação expirou. Entre com e-mail e senha de novo.");
    }
    if (!/^\d{6}$/.test(code)) {
      transaction((db) => log(db, ch.userId, "mfa_failed"));
      throw new ApiError(422, "Digite os 6 números do aplicativo autenticador.", { code: "Digite os 6 números" });
    }
    mfaChallenges.delete(mfaChallenge);
    return transaction((db) => {
      const u = db.users.find((x) => x.id === ch.userId && x.status === "ativo");
      if (!u) throw new ApiError(401, "Este usuário não pode entrar agora. Fale com a administração.");
      u.lastLoginAt = nowIso();
      log(db, u.id, "login", "2FA");
      setSessionUserId(u.id);
      return true;
    });
  },

  /** Descarta um desafio de 2FA (botão "Voltar" da tela de código). */
  cancelMfa: async (mfaChallenge: string) => {
    mfaChallenges.delete(mfaChallenge);
  },

  logout: async () => {
    await latency(80);
    const id = getSessionUserId();
    if (id) transaction((db) => log(db, id, "logout"));
    setSessionUserId(null);
  },

  /** Usuários disponíveis em "Trocar perfil" — só no modo de demonstração (RN-33). */
  demoProfiles: () =>
    read((db) => {
      if (!isDemoMode()) throw new ApiError(403, "A troca de perfil só existe na versão de demonstração.");
      return db.users
        .filter((u) => u.status === "ativo" && !u.deletedAt)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, avatarColor: u.avatarColor }));
    }, 60),

  /** RN-33 — troca de perfil da demonstração: só com o modo demo ligado, sempre registrada no log de acessos. */
  impersonate: async (userId: ID) => {
    await latency(80);
    if (!isDemoMode()) throw new ApiError(403, "A troca de perfil só existe na versão de demonstração.");
    transaction((db) => {
      const me = actor(db);
      const target = db.users.find((u) => u.id === userId && u.status === "ativo" && !u.deletedAt);
      if (!target) throw new ApiError(404, "Usuário não encontrado ou inativo.");
      log(db, me.id, "impersonate", `${me.name} → ${target.name} (${ROLE_LABEL[target.role]})`);
      setSessionUserId(target.id);
    });
  },

  /**
   * RF-M1-01 / RN-31 — cria token de uso único (1 h, só o hash fica no banco) e envia o e-mail
   * transacional. Resposta sempre igual (não revela se o e-mail existe); convidado, inativo ou
   * desconhecido não recebem token. `demoLink` só existe no modo de demonstração (o e-mail não sai de verdade).
   */
  requestPasswordReset: async (email: string): Promise<{ demoLink: string | null }> => {
    await latency(500);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new ApiError(422, "Informe um e-mail válido.", { email: "Informe um e-mail válido" });
    const token = secureToken();
    const tokenHash = await sha256Hex(token);
    const issued = transaction((db) => {
      const key = email.trim().toLowerCase();
      const u = db.users.find((x) => x.email.toLowerCase() === key && !x.deletedAt);
      log(db, u?.id ?? null, "password_reset_requested", key);
      if (!u || u.status !== "ativo") return false;
      const now = nowIso();
      resetsOf(db).filter((r) => r.userId === u.id && !r.usedAt).forEach((r) => (r.usedAt = now)); // só o link mais recente vale
      resetsOf(db).push({ ...baseFields(null), userId: u.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(), usedAt: null });
      queueSystemEmail(db, { to: [u.email], subject: "Recuperação de senha", template: "recuperar_senha" });
      return true;
    });
    return { demoLink: issued && isDemoMode() ? `/recuperar-senha?token=${token}` : null };
  },

  /** RN-31 — valida o token (existe, não expirou, não foi usado), grava a senha, consome o token e derruba as sessões abertas. */
  resetPassword: async (token: string, password: string) => {
    await latency(400);
    if (password.length < 8) throw new ApiError(422, "A senha precisa de pelo menos 8 caracteres.", { password: "Use pelo menos 8 caracteres" });
    const tokenHash = token ? await sha256Hex(token) : "";
    return transaction((db) => {
      const r = tokenHash ? resetsOf(db).find((x) => x.tokenHash === tokenHash) : undefined;
      if (!r || r.usedAt) throw new ApiError(409, "Este link de recuperação é inválido ou já foi usado.");
      if (new Date(r.expiresAt).getTime() < Date.now()) throw new ApiError(409, "Este link de recuperação expirou (vale 1 hora).");
      const u = db.users.find((x) => x.id === r.userId && x.status === "ativo");
      if (!u) throw new ApiError(409, "Este link de recuperação é inválido ou já foi usado.");
      u.passwordMock = password;
      u.sessionVersion = (u.sessionVersion ?? 0) + 1;
      touch(u);
      r.usedAt = nowIso();
      touch(r);
      failures.delete(u.email.toLowerCase());
      log(db, u.id, "password_reset_done");
      if (getSessionUserId() === u.id) setSessionUserId(null);
      return true;
    });
  },

  /** RF-M1-02 / RN-32 — aceite de convite. */
  getInvite: async (token: string) => {
    await latency(200);
    const tokenHash = await sha256Hex(token);
    const { u, inv } = findInvite(loadDb(), tokenHash);
    return { name: u.name, email: u.email, role: u.role, expiresAt: inv.expiresAt };
  },

  acceptInvite: async (token: string, input: { name: string; password: string }) => {
    await latency(500);
    if (input.password.length < 8) throw new ApiError(422, "A senha precisa de pelo menos 8 caracteres.", { password: "Use pelo menos 8 caracteres" });
    const tokenHash = await sha256Hex(token);
    return transaction((db) => {
      const { u, inv } = findInvite(db, tokenHash);
      u.name = input.name.trim() || u.name;
      u.passwordMock = input.password;
      u.status = "ativo";
      u.lastLoginAt = nowIso();
      touch(u);
      inv.usedAt = nowIso();
      touch(inv);
      log(db, u.id, "invite_accepted");
      emit(db, null, { type: "user.invite_accepted", entityType: "user", entityId: u.id, data: { email: u.email } });
      setSessionUserId(u.id);
      return u.id;
    });
  },

  /** RN-33 — restaurar a seed: só administrador e só no modo de demonstração. */
  resetDemo: async () => {
    await latency(300);
    if (!isDemoMode()) throw new ApiError(403, "Restaurar dados só existe na versão de demonstração.");
    const me = actor();
    requireAccess(me, "settings", "all", "Só administradores restauram os dados de demonstração.");
    resetDb();
    transaction((db) => log(db, me.id, "demo_reset"));
    setSessionUserId(me.id);
  },
};

/* ───────── Usuários (RF-M1-02/03) ───────── */
export const usersApi = {
  /** RN-30 — só quem lê Usuários (admin, gestão); nunca devolve token de convite nem senha. */
  list: (f: { q?: string; role?: Role; status?: string; includeFreelancers?: boolean } = {}) =>
    read((db, me) => {
      requireAccess(me, "users", "read");
      const q = f.q?.trim().toLowerCase();
      return db.users
        .filter((u) => !u.deletedAt)
        .filter((u) => f.includeFreelancers !== false || u.userType !== "freelancer")
        .filter((u) => !f.role || u.role === f.role)
        .filter((u) => !f.status || u.status === f.status)
        .filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => {
          const { sessionVersion: _v, ...rest } = safeUser(u);
          void _v;
          const pending = u.status === "convidado" ? invitesOf(db).filter((i) => i.userId === u.id && !i.usedAt && !i.revokedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined;
          return { ...rest, inviteExpiresAt: pending?.expiresAt ?? null };
        });
    }, 100),

  invite: async (input: { name: string; email: string; role: Role }) => {
    const created = await write((db, me) => {
      requireAccess(me, "users", "all", "Só administradores convidam usuários.");
      const email = input.email.trim().toLowerCase();
      const errors: Record<string, string> = {};
      if (!input.name.trim()) errors.name = "Informe o nome";
      if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Informe um e-mail válido";
      if (db.users.some((u) => u.email.toLowerCase() === email)) errors.email = "Já existe um usuário com este e-mail";
      if (Object.keys(errors).length) throw new ApiError(422, "Revise os campos destacados.", errors);
      const u: User = { ...baseFields(me.id), email, name: input.name.trim(), userType: input.role === "freelancer" ? "freelancer" : "internal", role: input.role, status: "convidado", avatarColor: ["#3f76ff", "#0fa37f", "#d97706", "#db2777", "#7c3aed"][db.users.length % 5], jobTitle: null, phone: null, mfaEnabled: false, lastLoginAt: null, passwordMock: "" };
      db.users.push(u);
      emit(db, me, { type: "user.invited", entityType: "user", entityId: u.id, data: { email, role: input.role } });
      return u.id;
    });
    return issueUserInvite(created, { email: true });
  },

  /** RN-32 — "Copiar link do convite" (só admin): gera um link novo e invalida o anterior. Não reenvia e-mail. */
  inviteLink: (id: ID) => issueUserInvite(id, { email: false, event: "user.invite_link_created" }),

  update: (id: ID, patch: { name?: string; role?: Role; jobTitle?: string | null; phone?: string | null }) =>
    write((db, me) => {
      if (!canWriteAll(me, "users") && id !== me.id) throw new ApiError(403, "Você só pode editar o seu próprio perfil. Peça a um administrador para alterar outras pessoas.");
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
      requireAccess(me, "users", "all", "Só administradores inativam ou reativam usuários.");
      if (id === me.id) throw new ApiError(409, "Você não pode inativar a si mesmo.");
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new ApiError(404, "Usuário não encontrado.");
      u.status = status;
      touch(u);
      emit(db, me, { type: status === "inativo" ? "user.deactivated" : "user.reactivated", entityType: "user", entityId: u.id, data: {} });
    }),

  /** RN-32 — reenviar gera token novo (o link anterior deixa de valer) e registra o e-mail. */
  resendInvite: async (id: ID) => {
    await issueUserInvite(id, { email: true, event: "user.invite_resent" });
  },

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
      requireAccess(me, "users", "all", "Só administradores veem o log de acessos.");
      return db.accessLogs.slice(-100).reverse().map((l) => ({ ...l, userName: db.users.find((u) => u.id === l.userId)?.name ?? l.detail ?? "—" }));
    }),

  /** Parâmetros da organização: todos leem (prazos e alíquota aparecem nas telas); só admin altera. */
  organization: () => read((db) => ({ org: db.organizations[0], flags: db.featureFlags })),

  updateOrganization: (patch: { freelancerPaymentDay: number; dueSoonDays: number; taxRatePct?: number; financeContactEmail?: string | null; financeContactPhone?: string | null }) =>
    write((db, me) => {
      requireAccess(me, "settings", "all", "Só administradores alteram as regras da organização.");
      const settings = { ...db.organizations[0].settings, ...patch };
      if (settings.taxRatePct < 0 || settings.taxRatePct > 30) throw new ApiError(422, "Use uma alíquota entre 0% e 30%.", { taxRatePct: "Use uma alíquota entre 0% e 30%" });
      if (settings.freelancerPaymentDay < 1 || settings.freelancerPaymentDay > 28) throw new ApiError(422, "Escolha um dia entre 1 e 28.", { freelancerPaymentDay: "Escolha um dia entre 1 e 28" });
      if (!Number.isInteger(settings.dueSoonDays) || settings.dueSoonDays < 1 || settings.dueSoonDays > 30) throw new ApiError(422, "Use de 1 a 30 dias de alerta.", { dueSoonDays: "Use de 1 a 30 dias" });
      // RN-67 — contato do Financeiro mostrado nas páginas públicas
      settings.financeContactEmail = settings.financeContactEmail?.trim().toLowerCase() || null;
      settings.financeContactPhone = settings.financeContactPhone?.trim() || null;
      if (settings.financeContactEmail && !/^\S+@\S+\.\S+$/.test(settings.financeContactEmail)) throw new ApiError(422, "Informe um e-mail válido para o Financeiro.", { financeContactEmail: "Informe um e-mail válido, ex.: financeiro@draw.com.br" });
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
  /** Log do cofre: use `admExtraApi.vaultLogs` (com a regra por item). Mantido aqui só para o administrador. */
  vaultLogs: (id?: ID) =>
    read((db, me) => {
      if (me.role !== "admin") throw new ApiError(403, "Só administradores veem o log geral do cofre.");
      return db.vaultAccessLogs.filter((l) => !id || l.vaultItemId === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100).map((l) => ({ ...l, userName: db.users.find((u) => u.id === l.userId)?.name ?? "—", itemTitle: db.vaultItems.find((v) => v.id === l.vaultItemId)?.title ?? "—" }));
    }),

  resources: () =>
    read((db, me) => {
      requireAccess(me, "adm", "read");
      return db.resources.filter((r) => !r.deletedAt).sort((a, b) => a.title.localeCompare(b.title));
    }),
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
    write((db, me) => {
      requireAccess(me, "settings", "all", "Só administradores enviam e-mail de teste.");
      if (!/^\S+@\S+\.\S+$/.test(to.trim())) throw new ApiError(422, "Informe um e-mail válido.", { to: "Informe um e-mail válido" });
      const s = db.systemMailSettings[0];
      if (s.transport === "draw_smtp" && !s.smtpHost) throw new ApiError(422, "Salve a configuração SMTP antes de testar.");
      db.emailLogs.push({ ...baseFields(null), channel: "system", provider: s.transport === "draw_smtp" ? "draw_smtp" : "brevo", userId: null, projectId: null, to: [to], cc: [], subject: "E-mail de teste da plataforma Draw", template: "teste", status: "delivered", error: null, sentAt: nowIso() });
      return true;
    }, 900),
};

/* ───────── Importação (RF-M5-08) ───────── */
type Row = Record<string, string>;

const SIMPLE_IMPORT_RESOURCE = { clientes: "clients", freelancers: "freelancers", recebiveis: "receivables" } as const;

/** Tipos do assistente simples; a planilha master tem o próprio serviço (`masterImportApi`). */
function assertSimpleImport(me: User, kind: ImportKind) {
  const resource = SIMPLE_IMPORT_RESOURCE[kind as keyof typeof SIMPLE_IMPORT_RESOURCE];
  if (!resource) throw new ApiError(422, "Tipo de importação não suportado aqui. Para a planilha master, use a opção \"Planilha master\".");
  requireAccess(me, resource, "all", "Seu perfil não pode importar este tipo de planilha. Peça a quem cuida do cadastro.");
}

export const importsApi = {
  list: () =>
    read((db, me) => {
      if (!(canWriteAll(me, "clients") || canWriteAll(me, "freelancers") || canWriteAll(me, "receivables"))) throw new ApiError(403, "Seu perfil não importa planilhas. Peça a um administrador.");
      return db.imports.filter((i) => !i.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }),
  /** Dry run: valida linha a linha sem gravar. */
  preview: (kind: ImportKind, rows: Row[]) =>
    read((db, me) => {
      assertSimpleImport(me, kind);
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
        } else if (kind === "recebiveis") {
          if (!r.codigo_projeto?.trim()) errors.push({ line, message: "Código do projeto vazio" });
          else if (!db.projects.some((p) => p.code === r.codigo_projeto.trim().toUpperCase())) errors.push({ line, message: `Projeto não encontrado: ${r.codigo_projeto}` });
          if (!r.valor || Number.isNaN(Number(r.valor.replace(/\./g, "").replace(",", ".")))) errors.push({ line, message: `Valor inválido: ${r.valor ?? "(vazio)"}` });
          // RN-69 — estado do histórico: recebido exige emissão; emissão exige nº da NF
          if (r.recebido_em?.trim() && !r.emissao?.trim()) errors.push({ line, message: "Recebido sem data de emissão da NF: informe a coluna emissao" });
          if (r.emissao?.trim() && !r.nf_numero?.trim()) errors.push({ line, message: "Emissão sem número da NF: informe a coluna nf_numero" });
        }
      });
      const blocking = new Set(errors.filter((e) => !e.message.includes("será atualizado")).map((e) => e.line));
      return { total: rows.length, ok: rows.length - blocking.size, errors };
    }, 500),
  commit: (kind: ImportKind, fileName: string, rows: Row[], report: { total: number; ok: number; errors: { line: number; message: string }[] }) =>
    write((db, me) => {
      assertSimpleImport(me, kind);
      const blocking = new Set(report.errors.filter((e) => !e.message.includes("será atualizado")).map((e) => e.line));
      let imported = 0;
      rows.forEach((r, i) => {
        if (blocking.has(i + 2)) return;
        if (kind === "clientes") {
          const existing = db.clients.find((c) => onlyDigits(c.cnpj) === onlyDigits(r.cnpj));
          if (existing) Object.assign(existing, { legalName: r.razao_social, tradeName: r.nome_fantasia || existing.tradeName, segment: r.segmento || existing.segment });
          else db.clients.push({ ...baseFields(me.id), groupId: null, legalName: r.razao_social, tradeName: r.nome_fantasia || r.razao_social, cnpj: r.cnpj, address: { street: "", number: "", complement: null, district: "", city: r.cidade ?? "", state: r.uf ?? "", zip: "" }, segment: r.segmento || "Outros", status: "ativo", notes: "Importado por planilha", paymentTermsNote: null, paymentTermDays: null });
        } else if (kind === "freelancers") {
          if (!db.freelancers.some((f) => f.email === r.email.toLowerCase())) db.freelancers.push({ ...baseFields(me.id), userId: null, name: r.nome, email: r.email.toLowerCase(), phone: r.telefone ?? null, jobTitle: r.cargo?.trim() || null, legalName: null, document: null, pixKey: r.pix ?? null, bankName: null, bankAgency: null, bankAccount: null, specialties: [(r.especialidade as "design") || "outro"], status: "ativo", notes: "Importado por planilha", avatarColor: "#0891b2" });
        } else if (kind === "recebiveis") {
          const p = db.projects.find((x) => x.code === r.codigo_projeto.trim().toUpperCase())!;
          const amountCents = Math.round(Number(r.valor.replace(/\./g, "").replace(",", ".")) * 100);
          // RN-69 — preserva o estado do histórico: nº + emissão → faturado; + recebido_em → recebido
          const at = (v?: string) => (v?.trim() ? new Date(`${v.trim()}T20:00:00.000Z`).toISOString() : null);
          const issuedAt = r.nf_numero?.trim() ? at(r.emissao) : null;
          const receivedAt = issuedAt ? at(r.recebido_em) : null;
          db.receivables.push({ ...baseFields(me.id), projectId: p.id, clientId: p.clientId, proposalInstallmentId: null, description: r.descricao || "Importado", amountCents, taxCents: taxOf(db, amountCents), expectedAt: at(r.vencimento) ?? nowIso(), invoiceNumber: issuedAt ? r.nf_numero.trim() : null, invoiceFileId: null, issuedAt, receivedAt, status: receivedAt ? "recebido" : issuedAt ? "faturado" : "previsto", kind: "parcela", collectionNote: null, dueBasis: "Importado de planilha" });
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
      return {
        projects: projects.filter((p) => `${p.code} ${p.title}`.toLowerCase().includes(term)).slice(0, 6).map((p) => ({ id: p.id, code: p.code, title: p.title, status: p.status, clientName: db.clients.find((c) => c.id === p.clientId)?.tradeName ?? "" })),
        clients: canRead(me, "clients") ? db.clients.filter((c) => !c.deletedAt && `${c.tradeName} ${c.legalName} ${c.cnpj}`.toLowerCase().includes(term)).slice(0, 5).map((c) => ({ id: c.id, name: c.tradeName, cnpj: c.cnpj })) : [],
        freelancers: canRead(me, "freelancers") && me.role !== "freelancer" ? db.freelancers.filter((f) => !f.deletedAt && f.name.toLowerCase().includes(term)).slice(0, 5).map((f) => ({ id: f.id, name: f.name, color: f.avatarColor })) : [],
        tasks: visibleTasks(db, me).filter((t) => t.title.toLowerCase().includes(term)).slice(0, 6).map((t) => ({ id: t.id, title: t.title, projectCode: db.projects.find((p) => p.id === t.projectId)?.code ?? null, statusKey: t.statusKey })),
      };
    }, 80),
};

/** Lista leve de pessoas para seletores (responsável, equipe, menções). */
export const peopleApi = {
  /** Freelancer não recebe o e-mail da equipe interna (só nome para menções). */
  internal: () => read((db, me) => db.users.filter((u) => u.status === "ativo" && u.userType === "internal").map((u) => ({ id: u.id, name: u.name, color: u.avatarColor, role: u.role, email: me.role === "freelancer" ? "" : u.email })), 60),
  all: () =>
    read((db) => [
      ...db.users.filter((u) => u.status === "ativo" && u.userType === "internal").map((u) => ({ kind: "user" as const, id: u.id, name: u.name, color: u.avatarColor, sub: u.jobTitle ?? "" })),
      ...db.freelancers.filter((f) => f.status === "ativo" && !f.deletedAt).map((f) => ({ kind: "freelancer" as const, id: f.id, name: f.name, color: f.avatarColor, sub: f.jobTitle ? `${f.jobTitle} · freelancer` : "Freelancer" })),
    ], 60),
  current: () => read((_db, me) => me.id, 10),
};

export { actor };
