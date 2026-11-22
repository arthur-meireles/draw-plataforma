import { cn } from "@/lib/cn";
import { passwordStrength } from "@/lib/password";

/** Barra de força da senha (4 segmentos). */
export function PasswordStrength({ value }: { value: string }) {
  const { score, label } = passwordStrength(value);
  if (!value) return null;
  const tone = score <= 1 ? "bg-danger" : score === 2 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full", i <= score ? tone : "bg-layer-active")} />
        ))}
      </div>
      <span className="w-16 text-right text-xs text-fg-subtle">{label}</span>
    </div>
  );
}
