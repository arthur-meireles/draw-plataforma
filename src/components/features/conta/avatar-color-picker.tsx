"use client";
import { Avatar } from "@/components/ui";
import { AVATAR_COLOR_OPTIONS } from "@/data/reference";
import { cn } from "@/lib/cn";

/** Escolha da cor do avatar (Minha conta › Perfil). As cores são dados do usuário, não tokens de tema. */
export function AvatarColorPicker({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Cor do avatar" className="flex flex-wrap gap-2">
      {AVATAR_COLOR_OPTIONS.map((c) => {
        const on = c.value.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c.label}
            onClick={() => onChange(c.value)}
            className={cn("touch-target rounded-full p-0.5 outline-none ring-offset-2 ring-offset-surface transition-transform focus-visible:ring-2 focus-visible:ring-accent", on ? "ring-2 ring-accent" : "hover:scale-105")}
          >
            <Avatar name={name || "?"} color={c.value} size="lg" />
          </button>
        );
      })}
    </div>
  );
}
