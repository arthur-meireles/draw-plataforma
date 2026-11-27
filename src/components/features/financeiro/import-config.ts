import type { ImportKind } from "@/data/types";
import type { Resource } from "@/lib/permissions";

export type WizardKind = ImportKind;

export interface ImportKindConfig {
  value: WizardKind;
  label: string;
  description: string;
  icon: "clients" | "freelancers" | "receivable" | "projects";
  columns: string[];
  required: string[];
  example: string[];
  file: string;
  /** Recursos com acesso total exigidos para importar (o tipo some para quem não tem). */
  needs: Resource[];
}

export const IMPORT_KINDS: ImportKindConfig[] = [
  {
    value: "clientes",
    label: "Clientes",
    description: "Cadastra clientes novos e atualiza os que têm o mesmo CNPJ.",
    icon: "clients",
    columns: ["razao_social", "nome_fantasia", "cnpj", "segmento", "cidade", "uf"],
    required: ["razao_social", "cnpj"],
    example: ["Silva & Associados Advocacia Ltda", "Silva Advogados", "11.222.333/0001-81", "Jurídico", "São Paulo", "SP"],
    file: "modelo-clientes.csv",
    needs: ["clients"],
  },
  {
    value: "freelancers",
    label: "Freelancers",
    description: "Cadastra freelancers novos; quem já tem o mesmo e-mail é ignorado.",
    icon: "freelancers",
    columns: ["nome", "email", "telefone", "cargo", "especialidade", "pix"],
    required: ["nome", "email"],
    example: ["Ana Souza", "ana.souza@email.com", "(11) 91234-5678", "Designer gráfico", "design", "ana.souza@email.com"],
    file: "modelo-freelancers.csv",
    needs: ["freelancers"],
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
    needs: ["receivables"],
  },
  {
    value: "planilha_master",
    label: "Planilha master",
    description: "Aba \"Projetos & Pagamentos\": clientes, projetos, equipe, recebíveis e pagáveis. Reimportar atualiza pelo ID (P001).",
    icon: "projects",
    columns: [],
    required: [],
    example: [],
    file: "modelo-planilha-master.csv",
    needs: ["projects", "receivables", "payables"],
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
