import { Badge } from "@/components/ui";
import { SPECIALTY_LABEL } from "@/data/reference";
import type { Specialty } from "@/data/types";

/** Especialidades do freelancer como badges. */
export function SpecialtyBadges({ specialties }: { specialties: Specialty[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {specialties.map((s) => (
        <Badge key={s} tone="accent">
          {SPECIALTY_LABEL[s]}
        </Badge>
      ))}
    </span>
  );
}
