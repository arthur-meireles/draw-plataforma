"use client";
/** RN-93 — histórico das tentativas de cobrança de um lançamento (quem, quando, canal e o que foi registrado). */
import { useApiQuery } from "@/data/hooks";
import { eventsApi } from "@/data/services";
import { dateTime } from "@/lib/format";

const CHANNEL: Record<string, string> = { email: "e-mail", whatsapp: "WhatsApp", telefone: "telefone", outro: "outro canal" };

export function CollectionHistory({ receivableId }: { receivableId: string }) {
  const q = useApiQuery(["events", "collection", receivableId], () => eventsApi.list({ entityType: "receivable", entityId: receivableId }));
  const items = (q.data ?? []).filter((e) => e.type === "receivable.collection_sent" || (e.type === "receivable.collection_note" && e.data.note));
  if (!items.length) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-medium text-fg-subtle">Registro de cobranças</p>
      <ul className="divide-y divide-line rounded-lg border border-line text-xs">
        {items.map((e) => (
          <li key={e.id} className="space-y-0.5 px-3 py-2">
            <p className="text-fg-subtle">
              <span className="font-medium text-fg">{e.actorName}</span> · {dateTime(e.occurredAt)}
              {e.type === "receivable.collection_sent" ? ` · cobrança enviada por ${CHANNEL[String(e.data.channel)] ?? "outro canal"}` : " · nota atualizada"}
            </p>
            {(!!e.data.note || !!e.data.to) && <p className="whitespace-pre-line text-fg-muted">{String(e.data.note ?? e.data.to)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
