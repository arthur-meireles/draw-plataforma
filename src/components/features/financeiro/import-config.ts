import type { ImportKind } from "@/data/types";

export type WizardKind = Extract<ImportKind, "clientes" | "freelancers" | "recebiveis">;

export const IMPORT_KINDS: { value: WizardKind; label: string; description: string; icon: "clients" | "freelancers" | "receivable"; columns: string[]; required: string[]; example: string[]; file: string }[] = [
  {
    value: "clientes",
    label: "Clientes",
    description: "Cadastra clientes novos e atualiza os que têm o mesmo CNPJ.",
    icon: "clients",
    columns: ["razao_social", "nome_fantasia", "cnpj", "segmento", "cidade", "uf"],
    required: ["razao_social", "cnpj"],
    example: ["Silva & Associados Advocacia Ltda", "Silva Advogados", "11.222.333/0001-81", "Jurídico", "São Paulo", "SP"],
    file: "modelo-clientes.csv",
  },
  {
    value: "freelancers",
    label: "Freelancers",
    description: "Cadastra freelancers novos; quem já tem o mesmo e-mail é ignorado.",
    icon: "freelancers",
    columns: ["nome", "email", "telefone", "especialidade", "pix"],
    required: ["nome", "email"],
    example: ["Ana Souza", "ana.souza@email.com", "(11) 91234-5678", "design", "ana.souza@email.com"],
    file: "modelo-freelancers.csv",
  },
  {
    value: "recebiveis",
    label: "Recebíveis",
    description: "Cria lançamentos a receber em projetos existentes, pelo código do projeto.",
    icon: "receivable",
    columns: ["codigo_projeto", "descricao", "valor", "vencimento"],
    required: ["codigo_projeto", "valor"],
    example: ["MEM-001", "Parcela 1 de 2", "5000,00", "30/12/2026"],
    file: "modelo-recebiveis.csv",
  },
];

/** "30/12/2026" | "2026-12-30" → "2026-12-30"; vazio/inválido → null. */
export function normalizeDate(v: string): string | null {
  const s = v.trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parts = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!parts) return null;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "R$ 1.500,00" → "1.500,00" (formato que a API entende). */
export const normalizeMoney = (v: string) => v.replace(/[^\d,.-]/g, "");
