/** Financeiro (M5) — composições de API usadas pelas telas (upload de PDF + emissão, formulário público). */
import { ApiError, requireAccessNow } from "./_core";
import { filesApi } from "./collab";
import { financeApi, publicInvoiceApi } from "./finance";
import type { ID } from "../types";

export const INVOICE_MAX_BYTES = 10 * 1024 * 1024;
/** Acima disso o PDF não é embutido (data URL) no armazenamento local. */
export const INVOICE_INLINE_BYTES = 1.5 * 1024 * 1024;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new ApiError(422, "Não foi possível ler o arquivo. Tente anexar novamente."));
    r.readAsDataURL(file);
  });

function assertPdf(file: File) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) throw new ApiError(422, "Envie a nota fiscal em PDF.", { file: "Envie a nota fiscal em PDF" });
  if (file.size > INVOICE_MAX_BYTES) throw new ApiError(422, "O PDF passa de 10 MB. Reduza o arquivo e tente de novo.", { file: "O PDF passa de 10 MB" });
}

export const financeExtraApi = {
  /** RF-M5-02 — anexa o PDF (categoria `nf`) e emite a NF do recebível numa única chamada. */
  issueInvoiceWithFile: async (receivableId: ID, projectId: ID, input: { invoiceNumber: string; issuedAt: string; taxCents?: number; file?: File | null }) => {
    requireAccessNow("receivables", "all", "Só o Financeiro e a administração emitem notas fiscais."); // antes de enviar o PDF
    let invoiceFileId: ID | null = null;
    if (input.file) {
      assertPdf(input.file);
      invoiceFileId = (await filesApi.upload({ projectId, category: "nf", file: input.file })).fileId;
    }
    return financeApi.issueInvoice(receivableId, { invoiceNumber: input.invoiceNumber, issuedAt: input.issuedAt, taxCents: input.taxCents, invoiceFileId });
  },
};

export const publicInvoiceExtraApi = {
  /** RF-M5-04 — envia o formulário público com o PDF (data URL só se ≤ 1,5 MB). */
  submitWithFile: async (token: string, input: { legalName: string; document: string; pixKey: string; invoiceNumber: string; amountCents: number; file: File | null }) => {
    if (input.file) assertPdf(input.file);
    const dataUrl = input.file && input.file.size <= INVOICE_INLINE_BYTES ? await readAsDataUrl(input.file) : null;
    return publicInvoiceApi.submit(token, {
      legalName: input.legalName,
      document: input.document,
      pixKey: input.pixKey,
      invoiceNumber: input.invoiceNumber,
      amountCents: input.amountCents,
      fileName: input.file?.name ?? "",
      fileSize: input.file?.size ?? 0,
      dataUrl,
    });
  },
};
