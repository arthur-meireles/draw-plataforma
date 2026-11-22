"use client";
/** Escolhe o Início conforme o perfil (RF-M9-01 para freelancer). */
import { PageBody, PageHeader } from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { FreelancerHome } from "./freelancer-home";
import { InternalHome } from "./internal-home";

export function HomeView() {
  const { isFreelancer } = usePermissions();
  return (
    <>
      <PageHeader crumbs={[{ label: "Início", icon: "home" }]} />
      <PageBody width="content">{isFreelancer ? <FreelancerHome /> : <InternalHome />}</PageBody>
    </>
  );
}
