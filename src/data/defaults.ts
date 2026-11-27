/** Valores iniciais compartilhados entre a seed e a "API" local para campos novos de entidades. */
import type { ShareLink } from "./types";

/** Campos de envio/resposta do link público (RN-51/52) — vazios até o link ser enviado ou respondido. */
export const CLIENT_LINK_DEFAULTS: Pick<ShareLink, "fileVersionIds" | "recipients" | "message" | "lastSentAt" | "viewedAt" | "respondedAt" | "response" | "responseComment" | "respondentName"> = {
  fileVersionIds: [],
  recipients: [],
  message: null,
  lastSentAt: null,
  viewedAt: null,
  respondedAt: null,
  response: null,
  responseComment: null,
  respondentName: null,
};
