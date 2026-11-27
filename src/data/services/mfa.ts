/**
 * Verificação em duas etapas por TOTP (RF-M1-06 / RN-37): cadastro com segredo + QR, confirmação por código,
 * 10 códigos de recuperação de uso único, desligar/gerar códigos com a senha e obrigatoriedade para
 * administradores (configuração da organização `requireMfaForAdmins`, padrão ligado).
 *
 * Validação: TOTP real (RFC 6238, SHA-1, 30 s, 6 dígitos, janela ±1). No modo de demonstração qualquer sequência
 * de 6 dígitos também passa (a seed não tem segredos e os testes visuais precisam entrar) — fora dele, só o código
 * do aplicativo ou um código de recuperação.
 */
import { loadDb, nowIso, transaction } from "../db";
import type { Database, ID, User } from "../types";
import { ApiError, actor, latency, secureToken, setSessionUserId, sha256Hex, touch } from "./_core";
import { securityLog } from "./users-extra";
import { isDemoMode } from "@/lib/demo";

/* ───────── TOTP (RFC 4226/6238) ───────── */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hotp(key: Uint8Array, counter: number, digits = 6): Promise<string> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
  const off = sig[sig.length - 1] & 0xf;
  const bin = ((sig[off] & 0x7f) << 24) | (sig[off + 1] << 16) | (sig[off + 2] << 8) | sig[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

/** Código TOTP do instante `at` (ms). */
export const totp = (secretB32: string, at = Date.now(), digits = 6) => hotp(base32Decode(secretB32), Math.floor(at / 30_000), digits);

/** Confere o código com tolerância de ±30 s (relógio do celular). */
export async function verifyTotp(secretB32: string, code: string, at = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  for (const w of [0, -1, 1]) if ((await hotp(base32Decode(secretB32), Math.floor(at / 30_000) + w)) === code) return true;
  return false;
}

const newSecret = () => {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
};

const otpauthUrl = (u: User, secret: string) => `otpauth://totp/${encodeURIComponent(`Draw:${u.email}`)}?secret=${secret}&issuer=Draw&algorithm=SHA1&digits=6&period=30`;

/** Formata o segredo em blocos de 4 para digitar no aplicativo. */
const groupSecret = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

/* ───────── códigos de recuperação ───────── */

const RECOVERY_COUNT = 10;
const normRecovery = (c: string) => c.toLowerCase().replace(/[^a-z0-9]/g, "");
export const looksLikeRecoveryCode = (c: string) => /^[a-z0-9]{8}$/.test(normRecovery(c)) && !/^\d+$/.test(normRecovery(c));

async function newRecoveryCodes(): Promise<{ plain: string[]; hashes: string[] }> {
  const plain = Array.from({ length: RECOVERY_COUNT }, () => {
    const raw = secureToken().replace(/[^a-z0-9]/g, "").slice(0, 8);
    // garante ao menos uma letra (distingue do código de 6 dígitos)
    const code = /[a-z]/.test(raw) ? raw : `a${raw.slice(1)}`;
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  });
  const hashes = await Promise.all(plain.map((c) => sha256Hex(normRecovery(c))));
  return { plain, hashes };
}

/* ───────── regras ───────── */

/** RN-37 — o perfil exige 2FA? Administrador, enquanto a organização mantiver a exigência (padrão: sim). */
export const mfaRequiredFor = (db: Database, u: Pick<User, "role">) => u.role === "admin" && (db.organizations[0]?.settings.requireMfaForAdmins ?? true);

/** Precisa cadastrar o 2FA antes de entrar: obrigado e sem 2FA, ou (fora da demonstração) 2FA ligado sem segredo. */
export const needsMfaEnrollment = (db: Database, u: User) => (!u.mfaEnabled && mfaRequiredFor(db, u)) || (u.mfaEnabled && !u.mfaSecret && !isDemoMode());

/**
 * Confere o segundo fator: TOTP do segredo, código de recuperação (consumido) ou, só na demonstração, 6 dígitos
 * quaisquer. Devolve como passou, ou null.
 */
export async function checkSecondFactor(userId: ID, code: string): Promise<"totp" | "recovery" | "demo" | null> {
  const u = loadDb().users.find((x) => x.id === userId);
  if (!u) return null;
  const c = code.trim();
  if (/^\d{6}$/.test(c)) {
    if (u.mfaSecret && (await verifyTotp(u.mfaSecret, c))) return "totp";
    return isDemoMode() ? "demo" : null;
  }
  if (!looksLikeRecoveryCode(c)) return null;
  const hash = await sha256Hex(normRecovery(c));
  return transaction((db) => {
    const x = db.users.find((y) => y.id === userId)!;
    const left = x.mfaRecoveryCodes ?? [];
    if (!left.includes(hash)) return null;
    x.mfaRecoveryCodes = left.filter((h) => h !== hash);
    touch(x);
    securityLog(db, x.id, "mfa_recovery_used", `${x.mfaRecoveryCodes.length} código(s) restantes`);
    return "recovery" as const;
  });
}

/* ───────── desafio de cadastro no login / convite (sem sessão até confirmar) ───────── */

const ENROLL_TTL_MS = 10 * 60_000;
const enrollChallenges = new Map<string, { userId: ID; expiresAt: number }>();

/** Login com senha correta de quem ainda precisa cadastrar o 2FA: desafio de 10 min, sem sessão (RN-37). */
export function issueEnrollChallenge(userId: ID): string {
  const token = secureToken();
  enrollChallenges.set(token, { userId, expiresAt: Date.now() + ENROLL_TTL_MS });
  return token;
}

function challengeUser(challenge: string): ID {
  const ch = enrollChallenges.get(challenge);
  if (!ch || ch.expiresAt < Date.now()) {
    enrollChallenges.delete(challenge);
    throw new ApiError(401, "O cadastro da verificação expirou. Entre com e-mail e senha de novo.");
  }
  return ch.userId;
}

function startFor(userId: ID) {
  return transaction((db) => {
    const u = db.users.find((x) => x.id === userId && x.status === "ativo" && !x.deletedAt);
    if (!u) throw new ApiError(401, "Este usuário não pode entrar agora. Fale com a administração.");
    const secret = newSecret();
    u.mfaPendingSecret = secret;
    touch(u);
    return { secret: groupSecret(secret), otpauthUrl: otpauthUrl(u, secret), account: u.email };
  });
}

async function confirmFor(userId: ID, code: string) {
  const u = loadDb().users.find((x) => x.id === userId);
  const pending = u?.mfaPendingSecret;
  if (!u || !pending) throw new ApiError(409, "Comece o cadastro de novo para gerar um código QR.");
  const ok = /^\d{6}$/.test(code) && ((await verifyTotp(pending, code)) || isDemoMode());
  if (!ok) throw new ApiError(422, "Código incorreto. Confira se o relógio do celular está certo e digite o código atual do aplicativo.", { code: "Código incorreto" });
  const codes = await newRecoveryCodes();
  transaction((db) => {
    const x = db.users.find((y) => y.id === userId)!;
    x.mfaSecret = pending;
    x.mfaPendingSecret = null;
    x.mfaEnabled = true;
    x.mfaEnrolledAt = nowIso();
    x.mfaRecoveryCodes = codes.hashes;
    touch(x);
    securityLog(db, x.id, "mfa_enabled");
  });
  return { recoveryCodes: codes.plain };
}

async function assertPassword(password: string) {
  const me = actor();
  if (me.passwordMock !== password) throw new ApiError(422, "Senha incorreta.", { password: "Senha incorreta" });
  return me;
}

export const mfaApi = {
  /** `GET /me/mfa` — situação do 2FA de quem está logado. */
  status: async () => {
    await latency(60);
    const db = loadDb();
    const me = actor(db);
    return { enabled: me.mfaEnabled, enrolledAt: me.mfaEnrolledAt ?? null, hasSecret: !!me.mfaSecret, recoveryCodesLeft: me.mfaRecoveryCodes?.length ?? 0, required: mfaRequiredFor(db, me) };
  },

  /** `POST /me/mfa/enrollment` — gera um segredo pendente (QR + chave manual). */
  startEnrollment: async () => {
    await latency(150);
    return startFor(actor().id);
  },

  /** `POST /me/mfa/enrollment/confirm` — confere o código do aplicativo, liga o 2FA e devolve os códigos de recuperação UMA vez. */
  confirmEnrollment: async (code: string) => {
    await latency(250);
    return confirmFor(actor().id, code.trim());
  },

  /** `DELETE /me/mfa` — exige a senha; administrador não desliga enquanto a organização exigir (409). */
  disable: async (password: string) => {
    await latency(250);
    const me = await assertPassword(password);
    return transaction((db) => {
      if (mfaRequiredFor(db, me)) throw new ApiError(409, "O 2FA é obrigatório para administradores. Para desligar, a organização precisa deixar de exigir.");
      const u = db.users.find((x) => x.id === me.id)!;
      Object.assign(u, { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaRecoveryCodes: [], mfaEnrolledAt: null });
      touch(u);
      securityLog(db, u.id, "mfa_disabled");
    });
  },

  /** `POST /me/mfa/recovery-codes` — gera 10 códigos novos (os anteriores deixam de valer); exige a senha. */
  regenerateRecoveryCodes: async (password: string) => {
    await latency(250);
    const me = await assertPassword(password);
    if (!me.mfaEnabled) throw new ApiError(409, "Ligue a verificação em duas etapas antes de gerar códigos.");
    const codes = await newRecoveryCodes();
    transaction((db) => {
      const u = db.users.find((x) => x.id === me.id)!;
      u.mfaRecoveryCodes = codes.hashes;
      touch(u);
      securityLog(db, u.id, "mfa_recovery_regenerated");
    });
    return { recoveryCodes: codes.plain };
  },

  /** `POST /auth/mfa-enrollment/start` — cadastro obrigatório durante o login/convite (sem sessão). */
  startEnrollmentForChallenge: async (challenge: string) => {
    await latency(150);
    return startFor(challengeUser(challenge));
  },

  /** `POST /auth/mfa-enrollment/confirm` — confirma, liga o 2FA, cria a sessão e devolve os códigos de recuperação. */
  confirmEnrollmentForChallenge: async (challenge: string, code: string) => {
    await latency(250);
    const userId = challengeUser(challenge);
    const r = await confirmFor(userId, code.trim());
    enrollChallenges.delete(challenge);
    transaction((db) => {
      const u = db.users.find((x) => x.id === userId && x.status === "ativo");
      if (!u) throw new ApiError(401, "Este usuário não pode entrar agora. Fale com a administração.");
      u.lastLoginAt = nowIso();
      securityLog(db, u.id, "login", "2FA cadastrado no login");
      setSessionUserId(u.id);
    });
    return r;
  },

  /** Descarta o desafio de cadastro (botão "Voltar"). */
  cancelEnrollmentChallenge: async (challenge: string) => {
    enrollChallenges.delete(challenge);
  },
};
