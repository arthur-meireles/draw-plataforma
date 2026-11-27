"use client";
import { usePermissions } from "@/components/layout/session";
import { PageBody, PageHeader } from "@/components/ui";
import { AppSection } from "./app-section";
import { AppearanceSection } from "./appearance-section";
import { FeatureFlagsSection } from "./feature-flags-section";
import { NotificationMatrix } from "./notification-matrix";
import { OrgSettingsSection } from "./org-settings-section";

/** Preferências pessoais (todos os usuários) + regras da organização (admin; gestão lê). */
export function PreferencesView() {
  const p = usePermissions();
  return (
    <>
      <PageHeader crumbs={[{ label: "Configurações", icon: "settings", href: p.canRead("settings") ? "/configuracoes/usuarios" : undefined }, { label: "Preferências" }]} />
      <PageBody width="narrow">
        <div className="space-y-5">
          <NotificationMatrix />
          {p.canRead("settings") && <OrgSettingsSection />}
          <AppearanceSection />
          {p.canRead("settings") && <FeatureFlagsSection />}
          <AppSection />
        </div>
      </PageBody>
    </>
  );
}
