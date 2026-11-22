/** Metadados de apresentação dos tipos de notificação (RF-M10-01). */
import type { IconName } from "@/components/ui";
import type { NotificationType } from "@/data/types";

export const notificationMeta: Record<NotificationType, { label: string; icon: IconName }> = {
  atribuicao: { label: "Atribuição", icon: "task" },
  mencao: { label: "Menção", icon: "mention" },
  prazo: { label: "Prazo próximo", icon: "due" },
  atraso: { label: "Atraso", icon: "warning" },
  aprovacao: { label: "Aprovação", icon: "approval" },
  nf_solicitada: { label: "NF solicitada", icon: "invoice" },
  nf_recebida: { label: "NF recebida", icon: "payable" },
};

export const notificationTypeOptions = (Object.keys(notificationMeta) as NotificationType[]).map((value) => ({ value, label: notificationMeta[value].label, icon: notificationMeta[value].icon }));
