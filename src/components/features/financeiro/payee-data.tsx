"use client";
/**
 * RN-48 — dados de pagamento do freelancer no contas a pagar: favorecido (cadastro) com cópia em um clique e
 * comparação com o que ele declarou ao enviar a NF, com "Atualizar cadastro com estes dados".
 */
import { Badge, Button, Callout, DescriptionList, Skeleton } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { freelancerPaymentDataApi } from "@/data/services";
import { formatCpfCnpj as formatDocument } from "@/lib/format-document";

const usePayee = (payableId: string, enabled: boolean) =>
  useApiQuery(["payee", payableId], () => freelancerPaymentDataApi.get(payableId), { enabled, retry: false });

/** Favorecido do pagamento (cadastro) — usado no diálogo "Registrar pagamento". */
export function PayeeSummary({ payableId }: { payableId: string }) {
  const { canWriteAll } = usePermissions();
  const can = canWriteAll("freelancerBank");
  const q = usePayee(payableId, can);
  if (!can) return null;
  if (q.isLoading) return <Skeleton className="h-28 w-full rounded-lg" />;
  if (q.error) return <Callout tone="warning" title="Não foi possível carregar os dados de pagamento">{q.error.message}</Callout>;
  const d = q.data;
  if (!d) return null;
  return (
    <div className="space-y-2 rounded-lg border border-line bg-layer p-3">
      <p className="text-xs font-medium text-fg-subtle">Favorecido (cadastro do freelancer)</p>
      <DescriptionList
        columns={1}
        items={[
          { label: "Nome / razão social", value: d.legalName ?? d.name, copy: d.legalName ?? d.name },
          { label: "CPF / CNPJ", value: d.document ? formatDocument(d.document) : "Não cadastrado", copy: d.document },
          { label: "Chave PIX", value: d.pixKey ?? "Não cadastrada", copy: d.pixKey },
          { label: "Banco", hidden: !d.bankName, value: d.bankName, copy: d.bankName },
          { label: "Agência", hidden: !d.bankAgency, value: d.bankAgency, copy: d.bankAgency },
          { label: "Conta", hidden: !d.bankAccount, value: d.bankAccount, copy: d.bankAccount },
        ]}
      />
      {d.differs.length > 0 && (
        <Callout tone="warning" title="Os dados declarados na NF são diferentes do cadastro">
          {d.differs.map((x) => x.label).join(", ")}. Confira no detalhe da conta e atualize o cadastro antes de pagar, se for o caso.
        </Callout>
      )}
    </div>
  );
}

/** Dados declarados na NF × cadastro, com a ação de atualizar o cadastro (painel da conta a pagar). */
export function DeclaredDataSection({ payableId, fallback }: { payableId: string; fallback: React.ReactNode }) {
  const { canWriteAll } = usePermissions();
  const can = canWriteAll("freelancerBank") && canWriteAll("freelancers");
  const q = usePayee(payableId, can);
  const apply = useApiMutation(() => freelancerPaymentDataApi.applyDeclared(payableId), { success: (r) => `Cadastro atualizado: ${r.updated.join(", ")}.` });
  if (!can || q.error) return <>{fallback}</>;
  if (q.isLoading || !q.data) return <Skeleton className="h-32 w-full rounded-lg" />;
  const d = q.data;
  const differs = new Set(d.differs.map((x) => x.field));
  const tag = (f: string) => (differs.has(f as never) ? <Badge tone="warning" size="xs">Diferente do cadastro</Badge> : null);
  return (
    <div className="space-y-3">
      <DescriptionList
        columns={1}
        items={[
          { label: "Razão social / nome", value: <span className="inline-flex flex-wrap items-center gap-1.5">{d.declared.legalName ?? "—"}{tag("legalName")}</span>, copy: d.declared.legalName },
          { label: "CPF / CNPJ", value: <span className="inline-flex flex-wrap items-center gap-1.5">{d.declared.document ? formatDocument(d.declared.document) : "—"}{tag("document")}</span>, copy: d.declared.document },
          { label: "Chave PIX", value: <span className="inline-flex flex-wrap items-center gap-1.5">{d.declared.pixKey ?? "—"}{tag("pixKey")}</span>, copy: d.declared.pixKey },
        ]}
      />
      {d.differs.length > 0 && (
        <Callout
          tone="warning"
          title="Dados diferentes do cadastro"
          action={
            <Button size="sm" variant="secondary" icon="refresh" loading={apply.isPending} onClick={() => apply.mutate(undefined)}>
              Atualizar cadastro com estes dados
            </Button>
          }
        >
          {d.differs.map((x) => x.label).join(", ")} declarados na NF não batem com o cadastro de {d.name}. Atualize se a mudança foi confirmada com o freelancer.
        </Callout>
      )}
    </div>
  );
}
