"use client";
/** Sessão do usuário logado + helpers de permissão para as telas (o back-end é quem garante). */
import { createContext, useContext, useMemo } from "react";
import type { authApi } from "@/data/services";
import { access, canRead, canSeeMoney, canWrite, canWriteAll, type Resource } from "@/lib/permissions";

export type SessionUser = NonNullable<Awaited<ReturnType<typeof authApi.me>>>;

const SessionContext = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionUser {
  const u = useContext(SessionContext);
  if (!u) throw new Error("useSession fora de SessionProvider");
  return u;
}

/** Permissões do usuário atual, memorizadas. */
export function usePermissions() {
  const user = useSession();
  return useMemo(
    () => ({
      user,
      role: user.role,
      isAdmin: user.role === "admin",
      isFreelancer: user.role === "freelancer",
      money: canSeeMoney(user),
      access: (r: Resource) => access(user, r),
      canRead: (r: Resource) => canRead(user, r),
      canWrite: (r: Resource) => canWrite(user, r),
      canWriteAll: (r: Resource) => canWriteAll(user, r),
    }),
    [user],
  );
}
