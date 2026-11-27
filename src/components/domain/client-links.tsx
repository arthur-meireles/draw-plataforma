"use client";
/**
 * Envio ao cliente por link público (RN-51/52): diálogo de envio (proposta, pedido de aprovação, entrega) e a lista
 * "Envios ao cliente" com status (enviado, visto, aprovado, ajustes pedidos, expirado) e as ações reenviar/revogar.
 * O cliente recebe um e-mail transacional do sistema — não existe e-mail interno.
 */
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  CopyButton,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  RowActions,
  Section,
  SelectField,
  Skeleton,
  TextareaField,
  useSuccessFlash,
  type IconName,
  type Tone,
} from "@/components/ui";
import { usePermissions } from "@/components/layout/session";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import {
  clientLinksApi,
  filesApi,
  proposalsApi,
  CLIENT_LINK_DAYS,
  type ClientLinkPurpose,
} from "@/data/services";
import {
  CLIENT_LINK_PURPOSE_LABEL,
  CLIENT_LINK_STATUS_LABEL,
} from "@/data/reference";
import type { ClientLinkStatus, ID, ProjectStageKey } from "@/data/types";
import { dateFull, dateTime, relative } from "@/lib/format";
import { projectStageOptions } from "./badges";

const statusTone: Record<ClientLinkStatus, Tone> = {
  enviado: "info",
  visto: "accent",
  aprovado: "success",
  ajustes: "orange",
  encerrado: "neutral",
  expirado: "neutral",
  revogado: "danger",
};
export const ClientLinkStatusBadge = ({
  status,
}: {
  status: ClientLinkStatus;
}) => (
  <Badge tone={statusTone[status]} pulseKey={status} dot>
    {CLIENT_LINK_STATUS_LABEL[status]}
  </Badge>
);

const purposeIcon: Record<ClientLinkPurpose, IconName> = {
  proposta: "proposal",
  aprovacao: "approval",
  entrega: "delivery",
};

/** Endereço público do link (o mesmo que vai no e-mail). */
export const clientLinkUrl = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/c/${token}`;

/** Quem pode enviar/gerenciar cada tipo de link (a regra é garantida no serviço). */
export function useCanSendToClient() {
  const { canWrite, canWriteAll, isFreelancer, money } = usePermissions();
  return (purpose: ClientLinkPurpose) =>
    purpose === "proposta"
      ? canWriteAll("commercial") && money
      : !isFreelancer && canWrite("projects");
}

type SendMode =
  | { kind: "proposta"; proposalId: ID; version: number }
  | {
      kind: "aprovacao";
      approvalId?: ID | null;
      stageKey?: ProjectStageKey | null;
    }
  | { kind: "entrega" };

const DIALOG_COPY: Record<
  ClientLinkPurpose,
  { title: string; submit: string; done: string }
> = {
  proposta: {
    title: "Enviar proposta ao cliente",
    submit: "Enviar proposta",
    done: "Enviada",
  },
  aprovacao: {
    title: "Pedir aprovação ao cliente",
    submit: "Enviar pedido",
    done: "Enviado",
  },
  entrega: {
    title: "Enviar entrega ao cliente",
    submit: "Enviar entrega",
    done: "Enviada",
  },
};

/** Diálogo único de envio: destinatários entre os contatos do cliente, arquivos (aprovação/entrega) e recado. */
export function SendToClientDialog({
  projectId,
  mode,
  defaultStage,
  onClose,
}: {
  projectId: ID;
  mode: SendMode;
  defaultStage?: ProjectStageKey | null;
  onClose: () => void;
}) {
  const copy = DIALOG_COPY[mode.kind];
  const withFiles = mode.kind !== "proposta";
  const contacts = useApiQuery(["client-links", "recipients", projectId], () =>
    clientLinksApi.recipients(projectId),
  );
  const files = useApiQuery(
    ["files", { projectId }],
    () => filesApi.list({ projectId }),
    { enabled: withFiles },
  );
  const deliverables = useMemo(
    () =>
      (files.data ?? []).filter(
        (f) => f.category !== "proposta" && f.category !== "nf",
      ),
    [files.data],
  );

  const [picked, setPicked] = useState<ID[] | null>(null);
  const chosen =
    picked ?? (contacts.data ?? []).filter((c) => c.isDefault).map((c) => c.id);
  const [fileIds, setFileIds] = useState<ID[]>([]);
  const [stage, setStage] = useState<ProjectStageKey>(
    (mode.kind === "aprovacao" && mode.stageKey) ||
      (defaultStage && defaultStage !== "concluido"
        ? defaultStage
        : "validacao_cliente"),
  );
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ok = useSuccessFlash();

  const send = useApiMutation(
    async () => {
      // proposta: o serviço de propostas marca como enviada e cria o link (RN-11/RN-51)
      if (mode.kind === "proposta")
        return proposalsApi.send(mode.proposalId, {
          contactIds: chosen,
          message,
        });
      if (mode.kind === "aprovacao")
        return clientLinksApi.requestApproval(projectId, {
          stageKey: stage,
          contactIds: chosen,
          fileIds,
          message,
          approvalId: mode.approvalId ?? null,
        });
      return clientLinksApi.sendDelivery(projectId, {
        contactIds: chosen,
        fileIds,
        message,
      });
    },
    {
      success:
        mode.kind === "proposta"
          ? `Proposta v${mode.version} enviada ao cliente`
          : mode.kind === "aprovacao"
            ? "Pedido de aprovação enviado ao cliente"
            : "Entrega enviada ao cliente",
      onSuccess: () => ok.flash(onClose),
      onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
    },
  );

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!chosen.length) errs.contactIds = "Escolha ao menos um destinatário";
    if (withFiles && !fileIds.length)
      errs.fileIds = "Escolha ao menos um arquivo";
    setErrors(errs);
    if (!Object.keys(errs).length) send.mutate(undefined);
  };
  const toggle = (list: ID[], id: ID, on: boolean) =>
    on ? [...list, id] : list.filter((x) => x !== id);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={copy.title}
      description={`O cliente recebe um e-mail do sistema com um link válido por ${CLIENT_LINK_DAYS} dias${mode.kind === "entrega" ? " para ver e baixar os arquivos" : " para ver, aprovar ou pedir ajustes"}. Você acompanha a resposta aqui e na sua Caixa de entrada.`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon="send"
            loading={send.isPending}
            success={ok.success}
            successLabel={copy.done}
            onClick={submit}
          >
            {copy.submit}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Destinatários" required error={errors.contactIds}>
          {() => (
            <>
              {contacts.error ? (
                <ErrorState
                  error={contacts.error}
                  onRetry={() => contacts.refetch()}
                  className="py-4"
                />
              ) : contacts.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9" />
                  <Skeleton className="h-9" />
                </div>
              ) : !contacts.data?.length ? (
                <Callout
                  tone="warning"
                  icon="warning"
                  title="O cliente não tem contato com e-mail"
                >
                  Cadastre um contato com e-mail na ficha do cliente para
                  enviar.
                </Callout>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {contacts.data.map((c) => (
                    <li key={c.id} className="px-3 py-2">
                      <Checkbox
                        checked={chosen.includes(c.id)}
                        onCheckedChange={(on) =>
                          setPicked(toggle(chosen, c.id, on))
                        }
                        label={c.name}
                        description={[
                          c.email,
                          c.isBillingContact ? "Cobrança" : null,
                          c.isDecisionMaker ? "Decisor" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Field>

        {mode.kind === "aprovacao" && !mode.approvalId && (
          <SelectField
            label="Etapa a aprovar"
            options={projectStageOptions(["concluido"])}
            value={stage}
            onChange={(v) => v && setStage(v)}
          />
        )}

        {withFiles && (
          <Field
            label={
              mode.kind === "aprovacao"
                ? "Arquivos para o cliente avaliar"
                : "Arquivos da entrega"
            }
            required
            error={errors.fileIds}
          >
            {() => (
              <>
                {files.error ? (
                  <ErrorState
                    error={files.error}
                    onRetry={() => files.refetch()}
                    className="py-4"
                  />
                ) : files.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-9" />
                    <Skeleton className="h-9" />
                  </div>
                ) : !deliverables.length ? (
                  <EmptyState
                    compact
                    icon="files"
                    title="Nenhum arquivo no projeto"
                    description="Envie os arquivos na aba Arquivos e volte aqui para compartilhar com o cliente."
                  />
                ) : (
                  <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line scrollbar-thin">
                    {deliverables.map((f) => (
                      <li key={f.id} className="px-3 py-2">
                        <Checkbox
                          checked={fileIds.includes(f.id)}
                          onCheckedChange={(on) =>
                            setFileIds((l) => toggle(l, f.id, on))
                          }
                          label={f.name}
                          description={`v${f.current?.version ?? 1} · enviado ${relative(f.current?.createdAt ?? f.createdAt)}`}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Field>
        )}

        <TextareaField
          label="Recado para o cliente"
          hint="Opcional. Aparece no topo da página do link."
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

type LinkRow = Awaited<ReturnType<typeof clientLinksApi.list>>[number];

function LinkResponse({ l }: { l: LinkRow }) {
  if (!l.response) return null;
  const approved = l.response === "aprovado";
  return (
    <p className="flex items-start gap-1.5 text-xs text-fg-muted">
      <Icon
        name={approved ? "success" : "comment"}
        size="xs"
        className={
          approved
            ? "mt-0.5 shrink-0 text-success"
            : "mt-0.5 shrink-0 text-orange"
        }
      />
      <span>
        {l.respondentName ?? "Cliente"} {approved ? "aprovou" : "pediu ajustes"}{" "}
        pelo link em {dateTime(l.respondedAt)}
        {l.responseComment ? <> — “{l.responseComment}”</> : null}
      </span>
    </p>
  );
}

/** "Envios ao cliente": links enviados do projeto, com status e ações. */
export function ClientLinksSection({
  projectId,
  purposes,
  actions,
  title = "Envios ao cliente",
  description,
}: {
  projectId: ID;
  purposes?: ClientLinkPurpose[];
  actions?: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const canSend = useCanSendToClient();
  const q = useApiQuery(["client-links", projectId], () =>
    clientLinksApi.list(projectId),
  );
  const rows = useMemo(
    () =>
      (q.data ?? []).filter((l) => !purposes || purposes.includes(l.purpose)),
    [q.data, purposes],
  );
  const [revoking, setRevoking] = useState<LinkRow | null>(null);
  const resend = useApiMutation((id: ID) => clientLinksApi.resend(id), {
    success: "Link reenviado ao cliente — vale por mais 30 dias",
  });
  const revoke = useApiMutation((id: ID) => clientLinksApi.revoke(id), {
    success: "Link revogado: o cliente não consegue mais abrir",
    onSuccess: () => setRevoking(null),
  });

  return (
    <Section
      title={title}
      icon="send"
      description={
        description ??
        "Links enviados por e-mail ao cliente. Acompanhe se ele viu e respondeu."
      }
      actions={actions}
      bodyClassName="p-0"
    >
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : !rows.length ? (
        <EmptyState
          compact
          icon="send"
          title="Nada enviado ao cliente ainda"
          description="Propostas, pedidos de aprovação e entregas enviados por link aparecem aqui com a situação de cada um."
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((l) => {
            const manageable = canSend(l.purpose);
            const live = l.status === "enviado" || l.status === "visto";
            const canResend =
              manageable && !l.response && l.status !== "encerrado";
            return (
              <li key={l.id} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Icon
                    name={purposeIcon[l.purpose]}
                    size="sm"
                    className="text-fg-subtle"
                  />
                  <span className="text-sm font-medium text-fg">
                    {l.subject}
                  </span>
                  <ClientLinkStatusBadge status={l.status} />
                  <span className="flex-1" />
                  {live && (
                    <CopyButton
                      value={clientLinkUrl(l.token)}
                      label="Copiar link do cliente"
                      successMessage="Link copiado"
                      size="xs"
                    />
                  )}
                  {manageable && (
                    <RowActions
                      label={`Ações do envio ${l.subject}`}
                      items={[
                        {
                          label: "Abrir página do cliente",
                          icon: "externalLink",
                          onSelect: () =>
                            window.open(
                              clientLinkUrl(l.token),
                              "_blank",
                              "noopener",
                            ),
                          hidden: !live,
                        },
                        {
                          label: "Reenviar e-mail",
                          icon: "send",
                          onSelect: () => resend.mutate(l.id),
                          hidden: !canResend,
                        },
                        {
                          label: "Revogar link…",
                          icon: "lock",
                          destructive: true,
                          onSelect: () => setRevoking(l),
                          hidden: !live,
                          separatorBefore: true,
                        },
                      ]}
                    />
                  )}
                </div>
                <p className="text-xs text-fg-subtle">
                  {CLIENT_LINK_PURPOSE_LABEL[l.purpose]} para{" "}
                  {l.recipients.join(", ")} · {relative(l.sentAt)}
                  {l.sentByName ? ` por ${l.sentByName}` : ""}
                  {l.viewedAt ? ` · visto em ${dateTime(l.viewedAt)}` : ""}
                  {live ? ` · vale até ${dateFull(l.expiresAt)}` : ""}
                </p>
                {l.files.length > 0 && (
                  <p className="truncate text-xs text-fg-muted">
                    Arquivos:{" "}
                    {l.files
                      .map((f) =>
                        f.version ? `${f.name} (v${f.version})` : f.name,
                      )
                      .join(", ")}
                  </p>
                )}
                <LinkResponse l={l} />
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revogar este link?"
        description="O cliente não consegue mais abrir a página. Você pode reenviar depois, se precisar."
        confirmLabel="Revogar link"
        destructive
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </Section>
  );
}
