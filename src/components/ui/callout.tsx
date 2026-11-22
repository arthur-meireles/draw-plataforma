"use client";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

const TONES = {
  info: { box: "border-info/25 bg-info-subtle", icon: "text-info", name: "info" as IconName },
  warning: { box: "border-warning/30 bg-warning-subtle", icon: "text-warning", name: "warning" as IconName },
  danger: { box: "border-danger/30 bg-danger-subtle", icon: "text-danger", name: "warning" as IconName },
  success: { box: "border-success/30 bg-success-subtle", icon: "text-success", name: "success" as IconName },
  neutral: { box: "border-line bg-layer", icon: "text-fg-subtle", name: "info" as IconName },
};

/** Aviso em bloco (banner de alerta, nota de segurança, orientação). */
export function Callout({ tone = "info", title, children, action, icon, className }: { tone?: keyof typeof TONES; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; icon?: IconName; className?: string }) {
  const t = TONES[tone];
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "note"} className={cn("flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm", t.box, className)}>
      <Icon name={icon ?? t.name} size="md" className={cn("mt-0.5", t.icon)} />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className="text-fg-muted">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2 max-sm:w-full">{action}</div>}
    </div>
  );
}
