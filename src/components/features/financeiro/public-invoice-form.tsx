"use client";
import { useState } from "react";
import { AuthHeading, AuthLayout } from "@/components/layout/auth-layout";
import { Badge, Button, DescriptionList, EmptyState, ErrorState, FileDropzone, Icon, MoneyField, Skeleton, TextField, useSuccessFlash, type IconName } from "@/components/ui";
import { useApiMutation, useApiQuery } from "@/data/hooks";
import { PAYABLE_STATUS_LABEL } from "@/data/reference";
import { INVOICE_MAX_BYTES, publicInvoiceApi, publicInvoiceExtraApi } from "@/data/services";
import { daysUntil, dateLong, fileSize, money, onlyDigits } from "@/lib/format";

type Info = Awaited<ReturnType<typeof publicInvoiceApi.get>>;

function Notice({ tone, icon, title, children }: { tone: "success" | "warning" | "info"; icon: IconName; title: string; children: React.ReactNode }) {
  const cls = { success: "border-success/30 bg-success-subtle text-success", warning: "border-warning/30 bg-warning-subtle text-warning", info: "border-info/30 bg-info-subtle text-info" }[tone];
  return (
    <div role="status" className={`flex gap-3 rounded-lg border p-4 ${cls}`}>
      <Icon name={icon} size="lg" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <div className="text-sm text-fg-muted">{children}</div>
      </div>
    </div>
  );
}

function Summary({ info }: { info: Info }) {
  const days = daysUntil(info.expiresAt);
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4 max-sm:bg-surface">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-fg-subtle">{info.projectCode}</span>
        <Badge tone="neutral">{info.freelancer.name}</Badge>
      </div>
      <p className="text-base font-semibold text-fg">{info.projectTitle}</p>
      <DescriptionList
        columns={2}
        items={[
          { label: "Serviço", value: info.description },
          { label: "Valor acordado", value: <strong className="text-md tabular-nums">{money(info.agreedAmountCents)}</strong> },
          { label: "Vencimento do pagamento", value: dateLong(info.dueAt) },
          { label: "Link válido até", value: `${dateLong(info.expiresAt)}${days != null && days >= 0 ? ` (${days === 0 ? "hoje" : `${days} ${days === 1 ? "dia" : "dias"}`})` : ""}` },
        ]}
      />
    </div>
  );
}

function Blocked({ icon, title, description }: { icon: IconName; title: string; description: string }) {
  return (
    <AuthLayout footer="Dúvidas? Responda ao e-mail que você recebeu da Draw.">
      <EmptyState icon={icon} title={title} description={description} />
    </AuthLayout>
  );
}

export function PublicInvoiceForm({ token }: { token: string }) {
  const q = useApiQuery(["public-invoice", token], () => publicInvoiceApi.get(token), { retry: false });
  const [legalName, setLegalName] = useState<string | null>(null);
  const [document, setDocument] = useState<string | null>(null);
  const [pixKey, setPixKey] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ status: string } | null>(null);

  const info = q.data;
  const values = { legalName: legalName ?? info?.freelancer.legalName ?? info?.freelancer.name ?? "", document: document ?? info?.freelancer.document ?? "", pixKey: pixKey ?? info?.freelancer.pixKey ?? "" };

  const sent = useSuccessFlash();
  const submit = useApiMutation(() => publicInvoiceExtraApi.submitWithFile(token, { ...values, invoiceNumber, amountCents: amount, file }), {
    success: false,
    onSuccess: (r) => sent.flash(() => setResult(r), 700),
    onError: (e) => e.fieldErrors && setErrors({ ...e.fieldErrors, amount: e.fieldErrors.amountCents ?? "" }),
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!values.legalName.trim()) errs.legalName = "Informe a razão social ou seu nome completo";
    const digits = onlyDigits(values.document);
    if (digits.length !== 11 && digits.length !== 14) errs.document = "CPF tem 11 dígitos e CNPJ tem 14";
    if (!values.pixKey.trim()) errs.pixKey = "Informe a chave PIX para o pagamento";
    if (!invoiceNumber.trim()) errs.invoiceNumber = "Informe o número da nota fiscal";
    if (amount <= 0) errs.amount = "Informe o valor da nota fiscal";
    if (!file) errs.file = "Anexe o PDF da nota fiscal";
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) requestAnimationFrame(() => {
        const el = globalThis.document.querySelector<HTMLElement>(`[data-field="${first}"]`);
        (el?.matches("input") ? el : el?.querySelector<HTMLElement>("input, button"))?.focus();
      });
    return !first;
  };

  if (q.isLoading)
    return (
      <AuthLayout width="lg">
        <div className="space-y-5" aria-busy role="status" aria-label="Carregando">
          <div className="space-y-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <Skeleton className="h-36 w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={i === 0 ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </AuthLayout>
    );

  if (q.error) {
    const msg = q.error.message ?? "";
    if (q.error.status === 404) return <Blocked icon="link" title="Link não encontrado" description="Confira se copiou o endereço inteiro do e-mail. Se o problema continuar, peça um novo link à Draw." />;
    if (/expirou/i.test(msg)) return <Blocked icon="time" title="Este link expirou" description="Por segurança, o link vale por 30 dias. Peça um novo à equipe financeira da Draw e você recebe outro por e-mail." />;
    if (/revogado/i.test(msg)) return <Blocked icon="lock" title="Este link foi cancelado" description="A Draw cancelou este pedido de nota. Peça um novo link se ainda precisar enviar sua NF." />;
    return (
      <AuthLayout>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </AuthLayout>
    );
  }
  if (!info) return null;

  if (result) {
    const divergent = result.status === "divergente";
    return (
      <AuthLayout width="lg" footer="Você já pode fechar esta página.">
        <div className="space-y-5">
          <AuthHeading title={divergent ? "Nota recebida, com uma divergência" : "Nota fiscal enviada"} description={`${info.projectCode} · ${info.projectTitle}`} />
          {divergent ? (
            <Notice tone="warning" icon="warning" title="O valor da NF é diferente do acordado">
              Você informou {money(amount)} e o combinado era {money(info.agreedAmountCents)}. A equipe financeira vai conferir e, se necessário, entrar em contato. O pagamento só é liberado depois dessa conferência (RN-04).
            </Notice>
          ) : (
            <Notice tone="success" icon="success" title="Está tudo certo — sua NF está em conferência">
              O valor bate com o acordado. A equipe financeira confere a nota e libera o pagamento até {dateLong(info.dueAt)}.
            </Notice>
          )}
          <DescriptionList items={[{ label: "NF nº", value: invoiceNumber }, { label: "Valor", value: money(amount) }, { label: "Arquivo", value: file?.name }, { label: "Chave PIX", value: values.pixKey }]} />
        </div>
      </AuthLayout>
    );
  }

  if (info.submittedAt || info.status !== "aguardando_nf") {
    return (
      <AuthLayout width="lg" footer="Precisa corrigir algo? Responda ao e-mail da Draw.">
        <div className="space-y-5">
          <AuthHeading title="Esta nota já foi enviada" description={`${info.projectCode} · ${info.projectTitle}`} />
          <Notice tone="info" icon="invoice" title={`Situação atual: ${PAYABLE_STATUS_LABEL[info.status]}`}>
            {info.submittedAt ? `Recebemos sua NF em ${dateLong(info.submittedAt)}. ` : ""}Não é preciso enviar de novo. Se algo estiver errado, a equipe financeira entra em contato.
          </Notice>
          <Summary info={info} />
        </div>
      </AuthLayout>
    );
  }

  const differs = amount > 0 && amount !== info.agreedAmountCents;

  return (
    <AuthLayout width="lg" footer="Seus dados são usados apenas para pagamento deste projeto.">
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (validate()) submit.mutate(undefined);
        }}
      >
        <AuthHeading title={`Olá, ${info.freelancer.name.split(" ")[0]}! Envie sua nota fiscal`} description="Confirme seus dados de pagamento e anexe a NF em PDF. Leva menos de um minuto." />
        <Summary info={info} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField containerClassName="sm:col-span-2" data-field="legalName" label="Razão social ou nome completo" required autoComplete="organization" value={values.legalName} onChange={(e) => setLegalName(e.target.value)} error={errors.legalName} />
          <TextField data-field="document" label="CPF ou CNPJ" required inputMode="numeric" autoComplete="off" value={values.document} onChange={(e) => setDocument(e.target.value)} error={errors.document} />
          <TextField data-field="pixKey" label="Chave PIX" required autoComplete="off" value={values.pixKey} onChange={(e) => setPixKey(e.target.value)} error={errors.pixKey} hint="CPF, CNPJ, e-mail, telefone ou chave aleatória." />
          <TextField data-field="invoiceNumber" label="Número da NF" required inputMode="numeric" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} error={errors.invoiceNumber} />
          <div data-field="amount">
            <MoneyField label="Valor da NF" required value={amount} onChange={setAmount} error={errors.amount} hint={`Valor acordado: ${money(info.agreedAmountCents)}`} />
          </div>
        </div>
        {differs && (
          <Notice tone="warning" icon="warning" title="Este valor é diferente do acordado">
            Você pode enviar assim, mas a nota ficará como divergente até a equipe financeira conferir.
          </Notice>
        )}
        <div data-field="file">
          <FileDropzone
            label="PDF da nota fiscal"
            required
            accept="application/pdf,.pdf"
            file={file}
            onFile={(f) => {
              setFile(f);
              setErrors((e) => ({ ...e, file: "" }));
            }}
            error={errors.file}
            hint="Somente PDF, até 10 MB."
            validate={(f) => (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf" ? "Envie a nota fiscal em PDF" : f.size > INVOICE_MAX_BYTES ? `O arquivo tem ${fileSize(f.size)}; o limite é 10 MB` : null)}
          />
        </div>
        <Button type="submit" variant="primary" size="lg" icon="send" loading={submit.isPending} success={sent.success} successLabel="Nota enviada" className="w-full">
          Enviar nota fiscal
        </Button>
      </form>
    </AuthLayout>
  );
}
