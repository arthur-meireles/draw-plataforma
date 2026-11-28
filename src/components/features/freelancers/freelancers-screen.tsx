"use client";
/** Listagem de freelancers (RF-M2-03). */
import { InactivateFreelancerDialog } from "./inactivate-freelancer-dialog";
import { useState } from "react";
import { Button, Fab, PageBody, PageHeader } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation } from "@/data/hooks";
import { freelancersApi, freelancersExtraApi } from "@/data/services";
import type { Freelancer } from "@/data/types";
import { FreelancerFiltersBar } from "./freelancer-filters";
import { FreelancerFormDialog } from "./freelancer-form-dialog";
import { FreelancerTable } from "./freelancer-table";
import { useFreelancerFilters, useFreelancers, type FreelancerRow } from "./use-freelancers";

export function FreelancersScreen() {
  const perms = usePermissions();
  const filters = useFreelancerFilters();
  const q = useFreelancers(filters.filters);
  const [form, setForm] = useState<{ open: boolean; freelancer: Freelancer | null }>({ open: false, freelancer: null });
  const [toInactivate, setToInactivate] = useState<FreelancerRow | null>(null);
  const canWrite = perms.canWriteAll("freelancers");
  const canInvite = perms.canWriteAll("users");

  const invite = useApiMutation((id: string) => freelancersApi.invite(id), { success: "Convite enviado. O freelancer receberá o link de acesso por e-mail." });
  const setStatus = useApiMutation((a: { id: string; status: "ativo" | "inativo" }) => freelancersExtraApi.setStatus(a.id, a.status), {
    success: (f) => (f.status === "ativo" ? "Freelancer reativado" : "Freelancer inativado"),
    onSuccess: () => setToInactivate(null),
  });
  const openCreate = () => setForm({ open: true, freelancer: null });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Freelancers", icon: "freelancers" }]}
        count={q.data?.length}
        actions={
          canWrite && (
            <Button variant="primary" size="sm" icon="add" onClick={openCreate} className="max-md:hidden">
              Novo freelancer
            </Button>
          )
        }
      />
      <FreelancerFiltersBar filters={filters} />
      <PageBody padded={false}>
        <FreelancerTable
          rows={q.data}
          isLoading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          hasFilters={filters.filterCount > 0}
          onClear={filters.clear}
          onCreate={openCreate}
          canWrite={canWrite}
          canInvite={canInvite}
          invitingId={invite.isPending ? invite.variables : null}
          onEdit={(f) => setForm({ open: true, freelancer: f })}
          onInvite={(f) => invite.mutate(f.id)}
          onToggleStatus={(f) => (f.status === "ativo" ? setToInactivate(f) : setStatus.mutate({ id: f.id, status: "ativo" }))}
        />
      </PageBody>
      {canWrite && <Fab label="Novo freelancer" onClick={openCreate} />}
      <FreelancerFormDialog open={form.open} onOpenChange={(o) => setForm((f) => ({ ...f, open: o }))} freelancer={form.freelancer} />
      <InactivateFreelancerDialog
        freelancer={toInactivate}
        onOpenChange={(o) => !o && setToInactivate(null)}
        loading={setStatus.isPending}
        onConfirm={() => toInactivate && setStatus.mutate({ id: toInactivate.id, status: "inativo" })}
      />
    </>
  );
}
