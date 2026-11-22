"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { SegmentedControl, Section } from "@/components/ui";

/** Tema claro, escuro ou do sistema (next-themes). */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Section title="Aparência" description="Vale só para este navegador" icon="palette">
      <SegmentedControl
        aria-label="Tema"
        value={mounted ? (theme ?? "system") : "system"}
        onChange={setTheme}
        options={[
          { value: "light", label: "Claro", icon: "themeLight" },
          { value: "dark", label: "Escuro", icon: "themeDark" },
          { value: "system", label: "Sistema", icon: "themeSystem" },
        ]}
      />
    </Section>
  );
}
