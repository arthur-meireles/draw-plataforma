import { Badge, type Tone } from "@/components/ui";
import { CLIENT_STATUS_LABEL } from "@/data/reference";
import type { ClientStatus } from "@/data/types";

const TONE: Record<ClientStatus, Tone> = { ativo: "success", inativo: "neutral", prospect: "info" };

/** Status do cliente (ativo, inativo, prospect). */
export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {CLIENT_STATUS_LABEL[status]}
    </Badge>
  );
}
