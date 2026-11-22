"use client";
import { usePermissions } from "@/components/layout/session";
import { ErrorState } from "@/components/ui";
import type { Resource } from "@/lib/permissions";

/** Mostra "Acesso restrito" quando o perfil não tem acesso ao recurso (o serviço também garante). */
export function AccessGate({ resource, write, children }: { resource: Resource; write?: boolean; children: React.ReactNode }) {
  const p = usePermissions();
  const ok = write ? p.canWrite(resource) : p.canRead(resource);
  if (!ok) return <ErrorState error={{ status: 403 }} />;
  return <>{children}</>;
}
