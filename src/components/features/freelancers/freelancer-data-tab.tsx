"use client";
/** Aba "Dados": cadastro e dados fiscais/bancários, mascarados sem permissão (RF-M2-04). */
import { DescriptionList, Icon, Section } from "@/components/ui";
import type { FreelancerDetail } from "./use-freelancers";

export function FreelancerDataTab({ freelancer: f }: { freelancer: FreelancerDetail }) {
  const protectedValue = (v: string | null) => (f.canSeeBank ? (v ?? "Não informado") : <span className="inline-flex items-center gap-1 text-fg-placeholder"><Icon name="lock" size="xs" />Protegido</span>);
  return (
    <div className="grid gap-4 p-3 md:p-6 lg:grid-cols-2">
      <Section title="Cadastro" icon="freelancer">
        <DescriptionList
          columns={1}
          items={[
            { label: "Nome", value: f.name },
            { label: "E-mail", value: f.email },
            { label: "Telefone", value: f.phone ?? "Não informado" },
            { label: "Observações", value: f.notes ?? "Sem observações" },
          ]}
        />
      </Section>
      <Section title="Dados fiscais e bancários" icon="lock" description={f.canSeeBank ? "Armazenados cifrados." : "Seu perfil não tem acesso a estes dados."}>
        <DescriptionList
          columns={2}
          items={[
            { label: "Razão social / nome na NF", value: protectedValue(f.legalName) },
            { label: "CPF ou CNPJ", value: protectedValue(f.document) },
            { label: "Chave PIX", value: protectedValue(f.pixKey) },
            { label: "Banco", value: protectedValue(f.bankName) },
            { label: "Agência", value: protectedValue(f.bankAgency) },
            { label: "Conta", value: protectedValue(f.bankAccount) },
          ]}
        />
      </Section>
    </div>
  );
}
