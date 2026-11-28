/** Regras de formato compartilhadas pelos cadastros e pelo formulário público de NF (RN-89). */
import { onlyDigits } from "@/lib/format";

/** CPF (11 dígitos) ou CNPJ (14). Vazio é permitido quando `required` é falso. */
export function documentError(value: string | null | undefined, required = false): string | null {
  const v = value?.trim() ?? "";
  if (!v) return required ? "Informe CPF ou CNPJ" : null;
  return [11, 14].includes(onlyDigits(v).length) ? null : "CPF deve ter 11 dígitos e CNPJ 14";
}

/** Chave PIX: e-mail, telefone (10–13 dígitos), CPF/CNPJ ou chave aleatória (UUID). */
export function pixKeyError(value: string | null | undefined): string | null {
  const v = value?.trim() ?? "";
  if (!v) return null;
  if (/^\S+@\S+\.\S+$/.test(v)) return null;
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(v)) return null;
  const d = onlyDigits(v);
  if (/^\+?[\d\s().-]+$/.test(v) && [10, 11, 12, 13, 14].includes(d.length)) return null;
  return "Chave PIX inválida: use e-mail, telefone, CPF/CNPJ ou chave aleatória";
}
