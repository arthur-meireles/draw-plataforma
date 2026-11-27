"use client";
/**
 * Troca rápida de perfil — só no modo de demonstração (RN-33), para demonstrar a matriz de permissões.
 * O serviço recusa fora da demonstração e registra cada troca no log de acessos.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, Badge, Dialog, ErrorState, Skeleton } from "@/components/ui";
import { useApiQuery } from "@/data/hooks";
import { ApiError, authApi } from "@/data/services";
import { ROLE_LABEL } from "@/data/reference";
import { usePermissions } from "./session";

export function ProfileSwitcherDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = usePermissions();
  const qc = useQueryClient();
  const router = useRouter();
  const users = useApiQuery(["users", "switcher"], authApi.demoProfiles, { enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Trocar perfil" description="Veja a plataforma como cada perfil. Disponível apenas na versão de demonstração." size="sm">
      <ul className="-mx-2 space-y-0.5">
        {users.error && <ErrorState error={users.error} onRetry={() => users.refetch()} />}
        {users.isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mx-2 my-2 h-9" />)}
        {users.data?.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              disabled={u.id === user.id}
              onClick={async () => {
                try {
                  await authApi.impersonate(u.id);
                } catch (err) {
                  toast.error((err as ApiError).message);
                  return;
                }
                qc.clear();
                onOpenChange(false);
                router.push("/");
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-layer-hover disabled:bg-accent-subtle"
            >
              <Avatar name={u.name} color={u.avatarColor} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{u.name}</span>
                <span className="block truncate text-xs text-fg-subtle">{u.email}</span>
              </span>
              <Badge tone={u.role === "admin" ? "accent" : u.role === "freelancer" ? "violet" : "neutral"}>{ROLE_LABEL[u.role]}</Badge>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
