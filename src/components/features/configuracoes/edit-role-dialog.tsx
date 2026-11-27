"use client";
import { useEffect, useState } from "react";
import { Button, Callout, Dialog, RadioGroup } from "@/components/ui";
import { useApiMutation } from "@/data/hooks";
import { ROLE_LABEL } from "@/data/reference";
import { usersApi } from "@/data/services";
import type { Role } from "@/data/types";
import { INVITABLE_ROLES, ROLE_DESCRIPTION, roleChangeNote } from "./roles";

/** Troca o perfil de um usuário (RF-M1-03). */
export function EditRoleDialog({ user, onClose }: { user: { id: string; name: string; role: Role } | null; onClose: () => void }) {
  const [role, setRole] = useState<Role>("operacao");
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (user) {
      setRole(user.role);
      setError(undefined);
    }
  }, [user]);
  const save = useApiMutation((v: { id: string; role: Role }) => usersApi.update(v.id, { role: v.role }), {
    success: "Perfil atualizado",
    onSuccess: onClose,
    onError: (e) => setError(e.message),
  });
  return (
    <Dialog
      open={!!user}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={`Alterar perfil de ${user?.name ?? ""}`}
      description="A mudança vale no próximo acesso da pessoa e fica registrada no histórico."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!user || role === user.role} onClick={() => user && save.mutate({ id: user.id, role })}>
            Salvar perfil
          </Button>
        </>
      }
    >
      <RadioGroup value={role} onChange={setRole} options={INVITABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r], description: ROLE_DESCRIPTION[r] }))} className="sm:grid-cols-2" />
      {user && role !== user.role && roleChangeNote(role, user.role) && (
        <Callout tone="info" className="mt-3">
          {roleChangeNote(role, user.role)}
        </Callout>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}
    </Dialog>
  );
}
