import { formatCnpj, onlyDigits } from "./format";

/** Formata CPF (11 dígitos) ou CNPJ (14) conforme o tamanho digitado. */
export function formatCpfCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length > 11) return formatCnpj(d);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}
