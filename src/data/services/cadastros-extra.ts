/** Comercial (M3): funil de cotações com a última proposta de cada projeto (RF-M3-01, RF-M3-06). */
import type { ID, Project, ProposalStatus, QuoteStageKey } from "../types";
import { ApiError, read, redactProject } from "./_core";
import { toListItem, type ProjectListItem } from "./projects";
import { access, canRead, canSeeMoney } from "@/lib/permissions";

const DAY = 86_400_000;

export interface QuoteFilters {
  stage?: QuoteStageKey;
  clientId?: ID;
  ownerId?: ID;
  projectTypeId?: ID;
  /** Período de entrada: últimos N dias. */
  periodDays?: number;
  q?: string;
}

export interface QuoteItem extends ProjectListItem {
  /** Coluna do funil: abertas pela etapa; aprovadas e perdidas por histórico. */
  column: QuoteStageKey;
  ownerName: string;
  ownerColor: string;
  proposalVersion: number | null;
  proposalAmountCents: number | null;
  proposalStatus: ProposalStatus | null;
  /** Dias desde a última movimentação (evento, envio ou entrada). */
  stalledDays: number;
  /** Dias desde o envio da proposta, se enviada. */
  daysSinceSent: number | null;
}

export const commercialApi = {
  /** Funil: cotações abertas + perdidas + aprovadas nos últimos 30 dias (histórico somente leitura). */
  quotes: (f: QuoteFilters = {}) =>
    read((db, me) => {
      if (!canRead(me, "commercial")) throw new ApiError(403, "Seu perfil não tem acesso ao funil comercial.");
      const now = Date.now();
      const money = canSeeMoney(me);
      const q = f.q?.trim().toLowerCase();
      const rows: QuoteItem[] = [];
      for (const p of db.projects as Project[]) {
        if (p.deletedAt || p.isEnvironment) continue;
        const open = p.status === "cotacao";
        const lost = p.status === "perdido";
        const won = p.origin === "cotacao" && !!p.approvedAt && p.status !== "cotacao" && p.status !== "perdido" && now - new Date(p.approvedAt).getTime() <= 30 * DAY;
        if (!open && !lost && !won) continue;
        const column: QuoteStageKey = open ? (p.quoteStageKey ?? "entrada") : lost ? "perdida" : "aprovada";
        if (f.stage && column !== f.stage) continue;
        if (f.clientId && p.clientId !== f.clientId) continue;
        if (f.ownerId && p.ownerId !== f.ownerId) continue;
        if (f.projectTypeId && p.projectTypeId !== f.projectTypeId) continue;
        if (f.periodDays && now - new Date(p.enteredAt).getTime() > f.periodDays * DAY) continue;
        const item = toListItem(db, redactProject(p, me), me);
        if (q && !`${p.code} ${p.title} ${item.clientName}`.toLowerCase().includes(q)) continue;
        const props = db.proposals.filter((pr) => pr.projectId === p.id && !pr.deletedAt).sort((a, b) => b.version - a.version);
        const latest = props.find((pr) => pr.status === "aprovada") ?? props[0] ?? null;
        const lastEvent = db.events.filter((e) => e.projectId === p.id).map((e) => e.occurredAt).sort().at(-1);
        const lastMove = [lastEvent, p.quoteSentAt, p.enteredAt].filter(Boolean).sort().at(-1)!;
        const owner = db.users.find((u) => u.id === p.ownerId);
        rows.push({
          ...item,
          column,
          ownerName: owner?.name ?? "—",
          ownerColor: owner?.avatarColor ?? "#888",
          proposalVersion: money ? (latest?.version ?? null) : null,
          proposalAmountCents: money ? (latest?.amountCents ?? null) : null,
          proposalStatus: money ? (latest?.status ?? null) : null,
          stalledDays: open ? Math.max(0, Math.floor((now - new Date(lastMove).getTime()) / DAY)) : 0,
          daysSinceSent: p.quoteSentAt && open ? Math.max(0, Math.floor((now - new Date(p.quoteSentAt).getTime()) / DAY)) : null,
        });
      }
      return {
        items: rows.sort((a, b) => a.position - b.position),
        canMove: access(me, "commercial") === "T",
        money,
      };
    }),
};
