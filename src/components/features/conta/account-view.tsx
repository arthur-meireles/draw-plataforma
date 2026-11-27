"use client";
import { Suspense } from "react";
import { usePermissions } from "@/components/layout/session";
import { FormPageSkeleton, PageBody, PageHeader, Tabs } from "@/components/ui";
import { useUrlState } from "@/lib/use-url-state";
import { SecuritySection } from "../configuracoes/security-section";
import { MyFreelancerDataSection } from "./my-freelancer-data-section";
import { ProfileSection } from "./profile-section";

type Aba = "perfil" | "seguranca" | "dados";

function Content() {
  const { isFreelancer } = usePermissions();
  const [url, setUrl] = useUrlState({ aba: "perfil" });
  const aba: Aba = url.aba === "seguranca" || (url.aba === "dados" && isFreelancer) ? (url.aba as Aba) : "perfil";
  return (
    <>
      <PageHeader crumbs={[{ label: "Configurações", icon: "settings", href: "/configuracoes/preferencias" }, { label: "Minha conta" }]} />
      <Tabs
        value={aba}
        onChange={(v) => setUrl({ aba: v })}
        items={[
          { value: "perfil", label: "Perfil", icon: "user" },
          { value: "seguranca", label: "Segurança", icon: "shield" },
          { value: "dados", label: "Meus dados de pagamento", icon: "money", hidden: !isFreelancer },
        ]}
      />
      <PageBody width="narrow">
        <div className="space-y-5">
          {aba === "perfil" && <ProfileSection />}
          {aba === "seguranca" && <SecuritySection />}
          {aba === "dados" && <MyFreelancerDataSection />}
        </div>
      </PageBody>
    </>
  );
}

/** Minha conta (todos os perfis): perfil, segurança (senha e 2FA) e, para freelancer, dados de pagamento. */
export function AccountView() {
  return (
    <Suspense fallback={<FormPageSkeleton />}>
      <Content />
    </Suspense>
  );
}
