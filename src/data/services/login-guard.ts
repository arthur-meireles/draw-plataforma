/**
 * RN-75 — bloqueio por tentativas de login e encerramento de sessões. O contador vive no log de acessos
 * (persiste, vale por conta e expira com o tempo), não em memória: 5 falhas na janela de 15 minutos bloqueiam
 * a conta até a falha mais antiga sair da janela. Login certo ou redefinição de senha zera a contagem.
 */
import type { Database } from "../types";
import { notifyMany } from "./audience";
import { ApiError, getSessionUserId, setSessionUserId, touch, write } from "./_core";
import { securityLog } from "./users-extra";

export const LOGIN_MAX_FAILS = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;

/** Estado do bloqueio de um e-mail: `until` é o instante em que a falha mais antiga sai da janela. */
export function loginLock(db: Database, key: string, now = Date.now()): { locked: boolean; until: number | null; minutes: number } {
  const user = db.users.find((u) => u.email.toLowerCase() === key && !u.deletedAt);
  const resetAt = user
    ? Math.max(0, ...db.accessLogs.filter((l) => l.userId === user.id && (l.action === "login" || l.action === "password_reset_done")).map((l) => Date.parse(l.at)))
    : 0;
  const since = Math.max(now - LOGIN_WINDOW_MS, resetAt);
  const fails = db.accessLogs
    .filter((l) => Date.parse(l.at) > since && ((l.action === "login_failed" && l.detail === key) || (l.action === "mfa_failed" && !!user && l.userId === user.id)))
    .map((l) => Date.parse(l.at))
    .sort((a, b) => a - b);
  if (fails.length < LOGIN_MAX_FAILS) return { locked: false, until: null, minutes: 0 };
  const until = fails[fails.length - LOGIN_MAX_FAILS] + LOGIN_WINDOW_MS;
  return { locked: true, until, minutes: Math.max(1, Math.ceil((until - now) / 60_000)) };
}

export function lockedError(minutes: number) {
  return new ApiError(403, `Muitas tentativas. Tente de novo em ${minutes} ${minutes === 1 ? "minuto" : "minutos"} ou recupere a senha por e-mail.`);
}

/** Registra o bloqueio (uma vez por janela) e avisa os administradores quando a conta existe. */
export function recordLoginBlocked(db: Database, key: string) {
  const user = db.users.find((u) => u.email.toLowerCase() === key && !u.deletedAt);
  const recent = db.accessLogs.some((l) => l.action === "login_blocked" && l.detail === key && Date.now() - Date.parse(l.at) < LOGIN_WINDOW_MS);
  if (recent) return;
  securityLog(db, user?.id ?? null, "login_blocked", key);
  if (user) {
    const admins = db.users.filter((u) => u.role === "admin" && u.status === "ativo" && !u.deletedAt).map((u) => u.id);
    notifyMany(db, null, admins, { type: "seguranca", title: `Conta bloqueada por tentativas: ${user.name}`, body: `${LOGIN_MAX_FAILS} senhas erradas em 15 minutos para ${key}. O acesso volta sozinho; se não foi a pessoa, avise-a.`, entityType: "user", entityId: user.id });
  }
}

export const sessionsApi = {
  /** "Encerrar outras sessões" (Minha conta › Segurança): invalida todas as sessões, menos esta. `POST /me/sessions/revoke-others`. */
  revokeOthers: () =>
    write((db, me) => {
      const u = db.users.find((x) => x.id === me.id)!;
      u.sessionVersion = (u.sessionVersion ?? 0) + 1;
      touch(u);
      if (getSessionUserId() === u.id) setSessionUserId(u.id); // esta continua
      securityLog(db, me.id, "sessions_revoked", "Outras sessões encerradas pela própria pessoa");
      return true;
    }),
};

