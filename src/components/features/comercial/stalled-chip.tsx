import { Badge } from "@/components/ui";

/** Dias parados: neutro até 7, atenção de 8 a 14, alerta acima disso. */
export function StalledChip({ days }: { days: number }) {
  const tone = days > 14 ? "danger" : days > 7 ? "warning" : "neutral";
  return (
    <Badge size="xs" tone={tone} icon="time">
      {days === 0 ? "Hoje" : `${days} d parada`}
    </Badge>
  );
}
