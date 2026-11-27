"use client";
/**
 * Página pública do cliente (/c/[token], RN-51/52): proposta, pedido de aprovação ou entrega enviados pela Draw.
 * Mesma moldura do formulário de NF (AuthLayout). O cliente vê, baixa e — em proposta/aprovação — aprova ou pede ajustes.
 */
import { useState } from "react";
import { toast } from "sonner";
import { AuthHeading, AuthLayout } from "@/components/layout/auth-layout";
import { Badge, Button, Callout, DescriptionList, EmptyState, ErrorState, Icon, Reveal, Skeleton, TextField, TextareaField, useSuccessFlash, type IconName } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { publicClientLinkApi } from "@/data/services";
import type { ShareLinkResponse } from "@/data/types";
import { dateLong, daysUntil, fileSize, money } from "@/lib/format";

type Info = Awaited<ReturnType<typeof publicClientLinkApi.get>>;

const HEADING: Record<Info["purpose"], (i: Info) => { title: string; description: string }> = {
  proposta: (i) => ({ title: `Proposta para ${i.project.clientName || "você"}`, description: "Confira a proposta e responda por aqui mesmo: aprove ou peça ajustes." }),
  aprovacao: (i) => ({ title: "Material para sua aprovação", description: `Etapa: ${i.approval?.stageLabel ?? "—"}. Veja os arquivos e responda: aprove ou peça ajustes.` }),
  entrega: () => ({ title: "Entrega de material", description: "Os arquivos abaixo foram liberados para você ver e baixar." }),
};

function Blocked({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return (
    <AuthLayout footer="Dúvidas? Responda ao e-mail que você recebeu da Draw.">
      <EmptyState icon={icon} title={title} description={description} />
    </AuthLayout>
  );
}

function Files({ token, files }: { token: string; files: Info["files"] }) {
  const download = useApiMutation((versionId: string) => publicClientLinkApi.download(token, versionId), {
    success: false,
    onSuccess: (r) => {
      if (!r.url) {
        toast.info("Arquivo de demonstração", { description: `O conteúdo de "${r.name}" não é guardado neste protótipo. Em produção, o download usa um link assinado de 5 minutos.` });
        return;
      }
      const a = document.createElement("a");
      a.href = r.url;
      a.download = r.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
  });
  if (!files.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Arquivos</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {files.map((f) => (
          <li key={f.versionId} className="flex items-center gap-3 px-3 py-2.5">
            <Icon name="file" size="sm" className="shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{f.name}</span>
              <span className="text-xs text-fg-subtle">
                v{f.version} · {fileSize(f.size)}
              </span>
            </span>
            <Button size="sm" variant="outline" icon="download" loading={download.isPending && download.variables === f.versionId} onClick={() => download.mutate(f.versionId)}>
              Baixar
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProposalSummary({ p }: { p: NonNullable<Info["proposal"]> }) {
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4 max-sm:bg-surface">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">Versão {p.version}</Badge>
        <span className="flex-1" />
        <strong className="text-lg tabular-nums text-fg">{money(p.amountCents)}</strong>
      </div>
      {p.scope && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Escopo</p>
          <p className="whitespace-pre-wrap text-sm text-fg-muted">{p.scope}</p>
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Parcelas</p>
        <ul className="space-y-1">
          {p.installments.map((i) => (
            <li key={i.number} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-fg-muted">
                {i.number}ª · {i.dueRule ?? (i.dueAt ? dateLong(i.dueAt) : "conforme combinado")}
              </span>
              <span className="tabular-nums font-medium text-fg">{money(i.amountCents)}</span>
            </li>
          ))}
        </ul>
      </div>
      {p.paymentTermsNote && <p className="text-xs text-fg-subtle">{p.paymentTermsNote}</p>}
    </div>
  );
}

function ResponseForm({ token, info, onDone }: { token: string; info: Info; onDone: (d: ShareLinkResponse) => void }) {
  const [mode, setMode] = useState<ShareLinkResponse | null>(null);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ok = useSuccessFlash();
  const respond = useApiMutation(() => publicClientLinkApi.respond(token, { decision: mode!, name, comment }), {
    success: false,
    onSuccess: (r) => ok.flash(() => onDone(r.decision!), 600),
    onError: (e) => e.fieldErrors && setErrors(e.fieldErrors),
  });
  const submit = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Informe seu nome";
    if (mode === "ajustes" && !comment.trim()) errs.comment = "Conte o que precisa ajustar";
    setErrors(errs);
    if (!Object.keys(errs).length) respond.mutate(undefined);
  };
  const what = info.purpose === "proposta" ? "proposta" : "material";

  if (!mode)
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="primary" size="lg" icon="check" onClick={() => setMode("aprovado")}>
          {info.purpose === "proposta" ? "Aprovar proposta" : "Aprovar material"}
        </Button>
        <Button size="lg" icon="comment" onClick={() => setMode("ajustes")}>
          Pedir ajustes
        </Button>
      </div>
    );

  return (
    <Reveal key={mode}>
      <form
        noValidate
        className="space-y-4 rounded-lg border border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm font-semibold text-fg">{mode === "aprovado" ? `Confirmar aprovação da ${what}` : "O que precisa ajustar?"}</p>
        <TextField label="Seu nome" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} hint="Fica registrado junto com a sua resposta." />
        {mode === "ajustes" ? (
          <TextareaField label="Ajustes" required rows={4} value={comment} onChange={(e) => setComment(e.target.value)} error={errors.comment} placeholder="Seja específico: o que mudar e onde." />
        ) : (
          <TextareaField label="Comentário" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} hint="Opcional." />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setMode(null)}>
            Voltar
          </Button>
          <Button type="submit" variant="primary" icon={mode === "aprovado" ? "check" : "send"} loading={respond.isPending} success={ok.success} successLabel="Resposta enviada">
            {mode === "aprovado" ? (info.purpose === "proposta" ? "Aprovar proposta" : "Aprovar material") : "Enviar pedido de ajustes"}
          </Button>
        </div>
      </form>
    </Reveal>
  );
}

export function PublicClientLink({ token }: { token: string }) {
  const q = useApiQuery(["public-client-link", token], () => publicClientLinkApi.get(token), { retry: false, refetchOnWindowFocus: false });
  const [done, setDone] = useState<ShareLinkResponse | null>(null);

  if (q.isLoading)
    return (
      <AuthLayout width="lg">
        <div className="space-y-5" aria-busy role="status" aria-label="Carregando">
          <div className="space-y-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </AuthLayout>
    );

  if (q.error) {
    const msg = q.error.message ?? "";
    if (q.error.status === 404) return <Blocked icon="link" title="Link não encontrado" description="Confira se copiou o endereço inteiro do e-mail. Se o problema continuar, peça um novo link ao seu contato na Draw." />;
    if (/expirou/i.test(msg)) return <Blocked icon="time" title="Este link expirou" description="Por segurança, o link vale por 30 dias. Peça um novo ao seu contato na Draw e você recebe outro por e-mail." />;
    if (/desativado/i.test(msg)) return <Blocked icon="lock" title="Este link foi desativado" description="A Draw desativou este envio. Se ainda precisar do material, peça um novo link ao seu contato." />;
    return (
      <AuthLayout>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </AuthLayout>
    );
  }
  const info = q.data;
  if (!info) return null;

  const head = HEADING[info.purpose](info);
  const days = daysUntil(info.expiresAt);
  const answered = done ?? info.response?.decision ?? null;

  return (
    <AuthLayout width="lg" footer={`Enviado pela ${info.organizationName}. Dúvidas? Responda ao e-mail que você recebeu.`}>
      <div className="space-y-5">
        <AuthHeading title={head.title} description={head.description} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          <span className="font-mono">{info.project.code}</span>
          <span className="text-sm font-medium text-fg">{info.project.title}</span>
        </div>
        {info.message && (
          <Callout tone="info" icon="comment" title="Recado da Draw">
            <span className="whitespace-pre-wrap">{info.message}</span>
          </Callout>
        )}
        {info.proposal && <ProposalSummary p={info.proposal} />}
        <Files token={token} files={info.files} />
        <DescriptionList
          items={[
            { label: "Enviado em", value: dateLong(info.sentAt) },
            { label: "Link válido até", value: `${dateLong(info.expiresAt)}${days != null && days >= 0 ? ` (${days === 0 ? "hoje" : `${days} ${days === 1 ? "dia" : "dias"}`})` : ""}` },
          ]}
        />
        {answered ? (
          <Reveal>
            <Callout tone={answered === "aprovado" ? "success" : "warning"} icon={answered === "aprovado" ? "success" : "comment"} title={answered === "aprovado" ? "Aprovação registrada. Obrigado!" : "Pedido de ajustes enviado"}>
              {answered === "aprovado"
                ? info.purpose === "proposta"
                  ? "A Draw já foi avisada e vai dar início ao projeto. Você recebe as próximas novidades pelo seu contato."
                  : "A Draw já foi avisada e segue para a próxima etapa."
                : "A equipe da Draw recebeu seus comentários e vai retornar com a nova versão."}
              {info.response?.name && !done ? ` Resposta de ${info.response.name}${info.response.at ? ` em ${dateLong(info.response.at)}` : ""}.` : ""}
            </Callout>
          </Reveal>
        ) : info.canRespond ? (
          <ResponseForm token={token} info={info} onDone={setDone} />
        ) : info.purpose !== "entrega" ? (
          <Callout tone="neutral" icon="info" title="Este pedido não está mais aberto para resposta">
            A Draw já registrou uma decisão ou enviou uma versão mais nova. Fale com seu contato se precisar.
          </Callout>
        ) : null}
      </div>
    </AuthLayout>
  );
}
