/**
 * Modelo de domínio — espelha a seção 6 da spec (nomes em inglês, rótulos em pt-BR na UI).
 * Toda entidade de domínio carrega os campos de auditoria de `BaseEntity` (P14).
 * Dinheiro sempre em centavos (`*Cents: number`), datas em ISO-8601 UTC.
 */

export type ID = string;
export type ISODate = string;

export interface BaseEntity {
  id: ID;
  organizationId: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  createdBy: ID | null;
  deletedAt: ISODate | null;
}

/* ───────────── 6.1 Identidade e acesso ───────────── */

export type UserType = "internal" | "freelancer" | "client";
export type Role = "admin" | "gestao" | "comercial" | "financeiro" | "operacao" | "freelancer";
export type UserStatus = "ativo" | "convidado" | "inativo";

export interface Organization extends Omit<BaseEntity, "organizationId"> {
  name: string;
  slug: string;
  /** taxRatePct: alíquota padrão sobre faturamento (planilha atual: 6%). */
  settings: { freelancerPaymentDay: number; dueSoonDays: number; taxRatePct: number };
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  userType: UserType;
  role: Role;
  status: UserStatus;
  avatarColor: string;
  jobTitle: string | null;
  phone: string | null;
  mfaEnabled: boolean;
  lastLoginAt: ISODate | null;
  /** Apenas mock local — no back-end real é argon2id. */
  passwordMock: string;
}

export type MemberRole = "responsavel" | "designer" | "roteirista" | "advogado" | "apoio";

export interface ProjectMember extends BaseEntity {
  projectId: ID;
  userId: ID | null;
  freelancerId: ID | null;
  memberRole: MemberRole;
  agreedAmountCents: number | null;
  active: boolean;
}

export interface FeatureFlag extends BaseEntity {
  key: string;
  enabled: boolean;
}

export interface AccessLog extends BaseEntity {
  userId: ID | null;
  action: "login" | "login_failed" | "logout" | "secret_revealed" | "sensitive_access";
  detail: string | null;
  at: ISODate;
}

/* ───────────── 6.2 Cadastros ───────────── */

export interface ClientGroup extends BaseEntity {
  name: string;
}

export interface Address {
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  zip: string;
}

export type ClientStatus = "ativo" | "inativo" | "prospect";

export interface Client extends BaseEntity {
  groupId: ID | null;
  legalName: string;
  tradeName: string;
  cnpj: string;
  address: Address;
  segment: string;
  status: ClientStatus;
  notes: string | null;
  /** Política de pagamento do cliente, ex.: "20 dias após emissão da NF" (planilha: Obs Política Pagto Cliente). */
  paymentTermsNote: string | null;
  /** Prazo em dias após a NF — usado para sugerir o vencimento ao emitir a nota. */
  paymentTermDays: number | null;
}

export interface ClientContact extends BaseEntity {
  clientId: ID;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  isBillingContact: boolean;
  isDecisionMaker: boolean;
}

export type Specialty = "design" | "roteiro" | "juridico" | "outro";
export type FreelancerStatus = "ativo" | "inativo";

export interface Freelancer extends BaseEntity {
  userId: ID | null;
  name: string;
  email: string;
  phone: string | null;
  legalName: string | null;
  document: string | null;
  pixKey: string | null;
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  /** Cargo / área de atuação (ex.: "Designer gráfico", "Advogada revisora") — mostra rápido o que a pessoa faz. */
  jobTitle: string | null;
  specialties: Specialty[];
  status: FreelancerStatus;
  notes: string | null;
  avatarColor: string;
}

export interface ProjectType extends BaseEntity {
  name: string;
  codePrefix: string;
  description: string | null;
  icon: string;
  active: boolean;
}

export interface ProjectTypeTaskTemplate extends BaseEntity {
  projectTypeId: ID;
  stageKey: ProjectStageKey;
  title: string;
  order: number;
  defaultDurationDays: number;
}

/* ───────────── 6.3 Processo (referência, somente leitura) ───────────── */

export type StageCategory = "open" | "waiting" | "done" | "lost";

export interface ReferenceItem<K extends string = string> {
  key: K;
  label: string;
  order: number;
  category: StageCategory;
}

export type QuoteStageKey =
  | "entrada"
  | "diagnostico"
  | "elaboracao"
  | "enviada"
  | "negociacao"
  | "aprovada"
  | "perdida";

/** Etapas de execução — alinhadas ao quadro "1. Casos" usado pela Draw (nov/2026). */
export type ProjectStageKey =
  | "roteiro"
  | "ajustes_roteiro"
  | "design"
  | "ajustes_design"
  | "validacao_cliente"
  | "concluido";

export type TaskStatusKey = "a_fazer" | "em_andamento" | "em_revisao" | "concluida";
export type PriorityKey = "baixa" | "media" | "alta" | "urgente";

/* ───────────── 6.4 Projetos e trabalho ───────────── */

export type ProjectOrigin = "cotacao" | "direto";
export type ProjectSize = "pequeno" | "medio" | "grande";
export type PaymentCondition = "a_vista" | "50_50" | "parcelado";

export type ProjectStatus = "cotacao" | "ativo" | "concluido" | "arquivado" | "perdido" | "cancelado";

export interface Project extends BaseEntity {
  clientId: ID;
  projectTypeId: ID;
  code: string;
  title: string;
  briefing: string | null;
  origin: ProjectOrigin;
  status: ProjectStatus;
  quoteStageKey: QuoteStageKey | null;
  projectStageKey: ProjectStageKey | null;
  priorityKey: PriorityKey;
  /** Posição manual dentro da etapa (fractional index — RF-M4-07). */
  position: number;
  ownerId: ID;
  billingContactId: ID | null;
  enteredAt: ISODate;
  quoteSentAt: ISODate | null;
  approvedAt: ISODate | null;
  startedAt: ISODate | null;
  dueAt: ISODate | null;
  estimatedEndAt: ISODate | null;
  completedAt: ISODate | null;
  archivedAt: ISODate | null;
  contractedAmountCents: number | null;
  lostReason: string | null;
  isEnvironment: boolean;
  /** Porte do projeto (planilha: Tamanho). */
  size: ProjectSize | null;
  /** Projeto parado (planilha: "Caso Parado") — não muda a etapa; sai dos alertas de prazo. */
  pausedAt: ISODate | null;
  pausedReason: string | null;
  /** Identificador legado da planilha master (ex.: P001) — chave de importação idempotente. */
  legacyCode: string | null;
  /** Condição de pagamento combinada (planilha: 50/50, À vista). */
  paymentCondition: PaymentCondition | null;
}

export type ProposalStatus = "rascunho" | "enviada" | "aprovada" | "recusada";

export interface Proposal extends BaseEntity {
  projectId: ID;
  version: number;
  amountCents: number;
  paymentTermsNote: string | null;
  status: ProposalStatus;
  sentAt: ISODate | null;
  approvedAt: ISODate | null;
  fileId: ID | null;
}

export interface ProposalInstallment extends BaseEntity {
  proposalId: ID;
  number: number;
  amountCents: number;
  dueRule: string | null;
  dueAt: ISODate | null;
}

export type TaskModule = "projeto" | "adm";

export interface Task extends BaseEntity {
  projectId: ID | null;
  module: TaskModule;
  parentTaskId: ID | null;
  stageKey: ProjectStageKey | QuoteStageKey | null;
  title: string;
  description: string | null;
  assigneeUserId: ID | null;
  assigneeFreelancerId: ID | null;
  statusKey: TaskStatusKey;
  priorityKey: PriorityKey;
  startAt: ISODate | null;
  dueAt: ISODate | null;
  estimateMinutes: number | null;
  position: number;
  sprintId: ID | null;
  completedAt: ISODate | null;
  /** Área das tarefas internas (module = adm) — quadro "Visão geral da empresa". */
  area: AdmArea | null;
}

/** Áreas internas (quadro atual: 2. Administrativo · 3. Comercial e Marketing · 4. Projetos · 5. Financeiro · 6. Outros). */
export type AdmArea = "administrativo" | "comercial_marketing" | "projetos_internos" | "financeiro" | "outros";

export type SprintStatus = "planejada" | "ativa" | "concluida";

export interface Sprint extends BaseEntity {
  name: string;
  startAt: ISODate;
  endAt: ISODate;
  status: SprintStatus;
}

export interface Milestone extends BaseEntity {
  projectId: ID;
  title: string;
  date: ISODate;
  learning: string | null;
}

export type DeliverableMetricKey =
  | "paginas_antes"
  | "paginas_depois"
  | "tempo_leitura_antes"
  | "tempo_leitura_depois";

export interface ProjectDeliverableMetric extends BaseEntity {
  projectId: ID;
  metric: DeliverableMetricKey;
  value: number;
}

/* ───────────── 6.5 Colaboração e arquivos ───────────── */

export interface Comment extends BaseEntity {
  projectId: ID;
  taskId: ID | null;
  authorId: ID;
  body: string;
  mentions: ID[];
}

export type ApprovalDecision = "pendente" | "aprovado" | "ajustes" | "negado";

export interface Approval extends BaseEntity {
  projectId: ID;
  stageKey: ProjectStageKey;
  requestedFrom: string;
  decision: ApprovalDecision;
  reason: string | null;
  decidedBy: ID | null;
  decidedAt: ISODate | null;
}

export type FileCategory =
  | "entrega"
  | "briefing"
  | "marca_cliente"
  | "proposta"
  | "nf"
  | "institucional"
  | "outro";

export interface FileEntity extends BaseEntity {
  projectId: ID | null;
  clientId: ID | null;
  module: "projeto" | "cliente" | "adm";
  taskId: ID | null;
  category: FileCategory;
  name: string;
  currentVersionId: ID;
  releasedToFreelancers: boolean;
  /** Pasta no Drive. Arquivos de projeto sem pasta aparecem em 01. Projetos/<Cliente>/<Código>. */
  folderId: ID | null;
}

/** Pasta do Drive (estrutura de pastas da Draw). `systemKey` marca as pastas-raiz fixas. */
export interface Folder extends BaseEntity {
  parentId: ID | null;
  name: string;
  systemKey: string | null;
  /** Perfis com acesso (vazio = todos os internos). Ex.: "08. Cérebro Paula" só admin. */
  allowedRoles: Role[];
  order: number;
}

export interface FileVersion extends BaseEntity {
  fileId: ID;
  version: number;
  storageKey: string;
  size: number;
  mime: string;
  sha256: string;
  uploadedBy: ID;
  note: string | null;
  /** Mock: conteúdo pequeno em data URL quando enviado no navegador. */
  dataUrl: string | null;
}

export type ShareLinkPurpose = "nf_freelancer" | "entrega";

export interface ShareLink extends BaseEntity {
  token: string;
  purpose: ShareLinkPurpose;
  projectId: ID | null;
  targetId: ID;
  expiresAt: ISODate;
  hasPassword: boolean;
  maxUses: number | null;
  useCount: number;
  revokedAt: ISODate | null;
}

/* ───────────── 6.6 Financeiro ───────────── */

export type ReceivableStatus = "previsto" | "faturado" | "recebido" | "vencido" | "cancelado";

export interface Receivable extends BaseEntity {
  projectId: ID;
  clientId: ID;
  proposalInstallmentId: ID | null;
  description: string;
  amountCents: number;
  taxCents: number;
  expectedAt: ISODate;
  invoiceNumber: string | null;
  invoiceFileId: ID | null;
  issuedAt: ISODate | null;
  receivedAt: ISODate | null;
  status: ReceivableStatus;
  /** parcela = da proposta/contrato; adicional = cobrança adicional (planilha: Valor/Status Cobrança Adicional). */
  kind: "parcela" | "adicional";
  /** Histórico curto de cobrança (planilha: Status/Comentários Cobrança). */
  collectionNote: string | null;
}

export type PayableKind = "freelancer" | "despesa_projeto" | "despesa_adm";
export type PayableStatus = "aguardando_nf" | "em_conferencia" | "divergente" | "aprovado" | "pago";

export interface Payable extends BaseEntity {
  projectId: ID | null;
  kind: PayableKind;
  freelancerId: ID | null;
  projectMemberId: ID | null;
  description: string;
  agreedAmountCents: number;
  invoicedAmountCents: number | null;
  invoiceFileId: ID | null;
  invoiceNumber: string | null;
  dueAt: ISODate;
  paidAt: ISODate | null;
  status: PayableStatus;
  divergenceNote: string | null;
}

export interface FreelancerInvoiceRequest extends BaseEntity {
  payableId: ID;
  shareLinkId: ID;
  sentAt: ISODate;
  submittedAt: ISODate | null;
  declaredLegalName: string | null;
  declaredDocument: string | null;
  declaredPixKey: string | null;
  declaredInvoiceNumber: string | null;
  declaredAmountCents: number | null;
}

/** Linha da view `v_project_financials`. */
export interface ProjectFinancials {
  projectId: ID;
  contractedCents: number;
  expectedCents: number;
  invoicedCents: number;
  receivedCents: number;
  toReceiveCents: number;
  freelancerCostCents: number;
  otherCostCents: number;
  marginCents: number;
  marginPct: number | null;
}

/* ───────────── 6.7 Administrativo ───────────── */

export interface InstitutionalDocument extends BaseEntity {
  title: string;
  category: "contrato_social" | "certidao" | "alvara" | "seguro" | "outro";
  fileId: ID | null;
  validUntil: ISODate | null;
}

export interface VaultItem extends BaseEntity {
  title: string;
  url: string | null;
  username: string | null;
  secret: string;
  notes: string | null;
  allowedRoles: Role[];
}

export interface VaultAccessLog extends BaseEntity {
  vaultItemId: ID;
  userId: ID;
  action: "revelar" | "copiar" | "editar";
  at: ISODate;
}

export type ResourceCategory = "ferramenta" | "template" | "playbook" | "referencia";

export interface Resource extends BaseEntity {
  title: string;
  url: string;
  category: ResourceCategory;
  description: string | null;
}

/* ───────────── 6.8 Plataforma ───────────── */

export interface DomainEvent extends BaseEntity {
  entityType: string;
  entityId: ID;
  projectId: ID | null;
  clientId: ID | null;
  actorId: ID | null;
  type: string;
  data: Record<string, unknown>;
  occurredAt: ISODate;
}

export type NotificationType =
  | "atribuicao"
  | "mencao"
  | "prazo"
  | "atraso"
  | "aprovacao"
  | "nf_solicitada"
  | "nf_recebida";

export interface Notification extends BaseEntity {
  userId: ID;
  type: NotificationType;
  projectId: ID | null;
  entityType: string | null;
  entityId: ID | null;
  title: string;
  body: string | null;
  readAt: ISODate | null;
}

export interface NotificationPreference extends BaseEntity {
  userId: ID;
  type: NotificationType;
  /** Notificações são só no app (Caixa de entrada) — não há e-mail interno. */
  enabled: boolean;
}

export type ImportKind = "clientes" | "freelancers" | "projetos" | "recebiveis" | "pagaveis";

export interface ImportJob extends BaseEntity {
  kind: ImportKind;
  sourceFileName: string;
  status: "pre_visualizacao" | "concluida" | "falhou";
  dryRun: boolean;
  report: { total: number; ok: number; errors: { line: number; message: string }[] };
}

export type EmailStatus = "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed";

/** Só e-mails transacionais do sistema para pessoas de fora (convite, recuperação de senha, pedido de NF ao freelancer). */
export interface EmailLog extends BaseEntity {
  channel: "system";
  provider: "brevo" | "resend" | "draw_smtp";
  userId: ID | null;
  projectId: ID | null;
  to: string[];
  cc: string[];
  subject: string;
  template: string | null;
  status: EmailStatus;
  error: string | null;
  sentAt: ISODate | null;
}

export interface SystemMailSettings extends BaseEntity {
  transport: "brevo_resend" | "draw_smtp";
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: "starttls" | "ssl" | null;
  smtpUser: string | null;
  smtpPasswordSet: boolean;
  fromName: string;
  fromAddress: string;
}

/* ───────────── Banco local ───────────── */

export interface Database {
  version: number;
  organizations: Organization[];
  users: User[];
  projectMembers: ProjectMember[];
  featureFlags: FeatureFlag[];
  accessLogs: AccessLog[];
  clientGroups: ClientGroup[];
  clients: Client[];
  clientContacts: ClientContact[];
  freelancers: Freelancer[];
  projectTypes: ProjectType[];
  projectTypeTaskTemplates: ProjectTypeTaskTemplate[];
  projects: Project[];
  proposals: Proposal[];
  proposalInstallments: ProposalInstallment[];
  tasks: Task[];
  sprints: Sprint[];
  milestones: Milestone[];
  projectDeliverableMetrics: ProjectDeliverableMetric[];
  comments: Comment[];
  approvals: Approval[];
  files: FileEntity[];
  folders: Folder[];
  fileVersions: FileVersion[];
  shareLinks: ShareLink[];
  receivables: Receivable[];
  payables: Payable[];
  freelancerInvoiceRequests: FreelancerInvoiceRequest[];
  institutionalDocuments: InstitutionalDocument[];
  vaultItems: VaultItem[];
  vaultAccessLogs: VaultAccessLog[];
  resources: Resource[];
  events: DomainEvent[];
  notifications: Notification[];
  notificationPreferences: NotificationPreference[];
  imports: ImportJob[];
  emailLogs: EmailLog[];
  systemMailSettings: SystemMailSettings[];
  /** Sequência de código por prefixo (RN-05) — nunca reutilizada. */
  codeSequences: Record<string, number>;
}

export type TableName = Exclude<keyof Database, "version" | "codeSequences">;
