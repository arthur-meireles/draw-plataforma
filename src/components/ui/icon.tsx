import { icons, type IconName } from "@/design/icons";
import { cn } from "@/lib/cn";

export type { IconName };

const SIZES = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24 } as const;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "ref"> {
  name: IconName;
  size?: keyof typeof SIZES;
  /** Texto para leitor de tela; sem ele o ícone é decorativo. */
  label?: string;
  spin?: boolean;
}

/** Único ponto de renderização de ícone. Espessura de traço fixa (1.75). */
export function Icon({ name, size = "md", label, spin, className, ...rest }: IconProps) {
  const Cmp = icons[name] ?? icons.folder;
  const px = SIZES[size];
  return (
    <Cmp
      width={px}
      height={px}
      strokeWidth={1.75}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      className={cn("shrink-0", spin && "animate-spin", className)}
      {...rest}
    />
  );
}
