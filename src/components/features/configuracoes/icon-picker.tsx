"use client";
import { Icon, IconButton, Label } from "@/components/ui";
import { PROJECT_TYPE_ICONS, type IconName } from "@/design/icons";
import { cn } from "@/lib/cn";

const LABEL: Partial<Record<IconName, string>> = {
  scale: "Balança",
  presentation: "Apresentação",
  "file-signature": "Documento assinado",
  "chart-pie": "Gráfico",
  "book-open": "Livro",
  "file-bar-chart": "Relatório",
  folder: "Pasta",
  image: "Imagem",
  palette: "Paleta",
  target: "Alvo",
};

/** Escolha do ícone do tipo de projeto (catálogo PROJECT_TYPE_ICONS). */
export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Ícone">
      <Label>Ícone</Label>
      <div className="flex flex-wrap gap-1.5">
        {PROJECT_TYPE_ICONS.map((name) => {
          const active = value === name;
          return (
            <IconButton
              key={name}
              icon={name}
              label={LABEL[name] ?? name}
              size="md"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(name)}
              className={cn("border", active ? "border-accent bg-accent-subtle text-accent hover:text-accent" : "border-line")}
            />
          );
        })}
      </div>
      <p className="text-xs text-fg-subtle">
        <Icon name="info" size="xs" className="mr-1 inline" />
        Aparece nos cartões e listas de projetos deste tipo.
      </p>
    </div>
  );
}
