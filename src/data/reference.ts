/**
 * Tabelas de referência (seção 6.3) — semeadas "por migração", somente leitura.
 * Mudar processo = alterar este arquivo + deploy (P4).
 */
import type {
  PriorityKey,
  ProjectStageKey,
  QuoteStageKey,
  ReferenceItem,
  TaskStatusKey,
  ProjectStatus,
  ReceivableStatus,
  PayableStatus,
  MemberRole,
  Role,
  Specialty,
  FileCategory,
  ProposalStatus,
  ApprovalDecision,
  ClientStatus,
  ResourceCategory,
} from "./types";

/** Funil comercial. "Possíveis casos" e "A fazer proposta" são as colunas iniciais do quadro atual da Draw. */
export const QUOTE_STAGES: ReferenceItem<QuoteStageKey>[] = [
  { key: "entrada", label: "Possíveis casos", order: 1, category: "open" },
  { key: "diagnostico", label: "Diagnóstico", order: 2, category: "open" },
  { key: "elaboracao", label: "A fazer proposta", order: 3, category: "open" },
  { key: "enviada", label: "Enviada", order: 4, category: "waiting" },
  { key: "negociacao", label: "Negociação", order: 5, category: "waiting" },
  { key: "aprovada", label: "Aprovada", order: 6, category: "done" },
  { key: "perdida", label: "Perdida", order: 7, category: "lost" },
];

/** Etapas de execução — espelham o quadro "1. Casos" da Draw (Roteiro → … → Com cliente para validação → Concluídos). */
export const PROJECT_STAGES: ReferenceItem<ProjectStageKey>[] = [
  { key: "roteiro", label: "Roteiro", order: 1, category: "open" },
  { key: "ajustes_roteiro", label: "Ajustes de roteiro", order: 2, category: "open" },
  { key: "design", label: "Design", order: 3, category: "open" },
  { key: "ajustes_design", label: "Ajustes de design", order: 4, category: "open" },
  { key: "validacao_cliente", label: "Com cliente para validação", order: 5, category: "waiting" },
  { key: "concluido", label: "Concluído", order: 6, category: "done" },
];

/** Primeira etapa de execução — onde o projeto entra ao ser aprovado ou criado direto. */
export const FIRST_PROJECT_STAGE: ProjectStageKey = "roteiro";

export const TASK_STATUSES: ReferenceItem<TaskStatusKey>[] = [
  { key: "a_fazer", label: "A fazer", order: 1, category: "open" },
  { key: "em_andamento", label: "Em andamento", order: 2, category: "open" },
  { key: "em_revisao", label: "Em revisão", order: 3, category: "waiting" },
  { key: "concluida", label: "Concluída", order: 4, category: "done" },
];

export const PRIORITIES: ReferenceItem<PriorityKey>[] = [
  { key: "urgente", label: "Urgente", order: 1, category: "open" },
  { key: "alta", label: "Alta", order: 2, category: "open" },
  { key: "media", label: "Média", order: 3, category: "open" },
  { key: "baixa", label: "Baixa", order: 4, category: "open" },
];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  cotacao: "Em cotação",
  ativo: "Ativo",
  concluido: "Concluído",
  arquivado: "Arquivado",
  perdido: "Perdido",
  cancelado: "Cancelado",
};

export const RECEIVABLE_STATUS_LABEL: Record<ReceivableStatus, string> = {
  previsto: "Previsto",
  faturado: "Faturado",
  recebido: "Recebido",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

export const PAYABLE_STATUS_LABEL: Record<PayableStatus, string> = {
  aguardando_nf: "Aguardando NF",
  em_conferencia: "Em conferência",
  divergente: "Divergente",
  aprovado: "Aprovado",
  pago: "Pago",
};

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aprovada: "Aprovada",
  recusada: "Recusada",
};

export const APPROVAL_DECISION_LABEL: Record<ApprovalDecision, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  ajustes: "Ajustes",
  negado: "Negado",
};

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  responsavel: "Responsável",
  designer: "Designer",
  roteirista: "Roteirista",
  advogado: "Advogado",
  apoio: "Apoio",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  gestao: "Gestão",
  comercial: "Comercial",
  financeiro: "Financeiro",
  operacao: "Operação",
  freelancer: "Freelancer",
};

export const SPECIALTY_LABEL: Record<Specialty, string> = {
  design: "Design",
  roteiro: "Roteiro",
  juridico: "Jurídico",
  outro: "Outro",
};

/** Sugestões de cargo para freelancers (o campo aceita texto livre). */
export const FREELANCER_JOB_TITLES = [
  "Designer gráfico",
  "Designer de informação",
  "Ilustrador",
  "Diagramador",
  "Motion designer",
  "UX writer",
  "Roteirista",
  "Redator jurídico",
  "Advogado revisor",
  "Revisor de texto",
  "Pesquisador",
] as const;

export const FILE_CATEGORY_LABEL: Record<FileCategory, string> = {
  entrega: "Entrega",
  briefing: "Briefing",
  marca_cliente: "Marca do cliente",
  proposta: "Proposta",
  nf: "Nota fiscal",
  institucional: "Institucional",
  outro: "Outro",
};

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  prospect: "Prospect",
};

export const RESOURCE_CATEGORY_LABEL: Record<ResourceCategory, string> = {
  ferramenta: "Ferramenta",
  template: "Template",
  playbook: "Playbook",
  referencia: "Referência",
};

/** Áreas internas do quadro "Visão geral da empresa". */
export const ADM_AREAS: { key: import("./types").AdmArea; label: string; number: number }[] = [
  { key: "administrativo", label: "Administrativo", number: 2 },
  { key: "comercial_marketing", label: "Comercial e Marketing", number: 3 },
  { key: "projetos_internos", label: "Projetos", number: 4 },
  { key: "financeiro", label: "Financeiro", number: 5 },
  { key: "outros", label: "Outros", number: 6 },
];

export const PROJECT_SIZE_LABEL: Record<import("./types").ProjectSize, string> = { pequeno: "Pequeno", medio: "Médio", grande: "Grande" };
export const PAYMENT_CONDITION_LABEL: Record<import("./types").PaymentCondition, string> = { a_vista: "À vista", "50_50": "50/50", parcelado: "Parcelado" };

/** Envio ao cliente por link (RN-51/52). */
export const CLIENT_LINK_PURPOSE_LABEL: Record<Exclude<import("./types").ShareLinkPurpose, "nf_freelancer">, string> = { proposta: "Proposta", aprovacao: "Pedido de aprovação", entrega: "Entrega" };
export const CLIENT_LINK_STATUS_LABEL: Record<import("./types").ClientLinkStatus, string> = {
  enviado: "Enviado",
  visto: "Visto",
  aprovado: "Aprovado",
  ajustes: "Ajustes pedidos",
  encerrado: "Encerrado",
  expirado: "Expirado",
  revogado: "Revogado",
};

export const quoteStage = (key: QuoteStageKey | null | undefined) =>
  QUOTE_STAGES.find((s) => s.key === key);
export const projectStage = (key: ProjectStageKey | null | undefined) =>
  PROJECT_STAGES.find((s) => s.key === key);
export const taskStatus = (key: TaskStatusKey) => TASK_STATUSES.find((s) => s.key === key)!;
export const priority = (key: PriorityKey) => PRIORITIES.find((s) => s.key === key)!;

/** Cores de avatar que a pessoa escolhe em Minha conta (dado gravado no usuário). */
export const AVATAR_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: "#3f76ff", label: "Azul" },
  { value: "#0fa37f", label: "Verde" },
  { value: "#d97706", label: "Âmbar" },
  { value: "#db2777", label: "Rosa" },
  { value: "#7c3aed", label: "Violeta" },
  { value: "#0891b2", label: "Ciano" },
  { value: "#dc2626", label: "Vermelho" },
  { value: "#4d7c0f", label: "Oliva" },
];
