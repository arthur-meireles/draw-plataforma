/**
 * Seed determinística do banco local. Datas são relativas ao dia em que a seed é criada,
 * para que o demo sempre tenha itens "vencendo hoje", "atrasados" etc.
 * Para recriar: Configurações → Preferências → "Restaurar dados de demonstração".
 */
import type {
  Approval,
  BaseEntity,
  Client,
  ClientContact,
  ClientGroup,
  Comment,
  Database,
  DomainEvent,
  EmailLog,
  FileEntity,
  FileVersion,
  Freelancer,
  FreelancerInvoiceRequest,
  ID,
  InstitutionalDocument,
  Milestone,
  Notification,
  NotificationPreference,
  NotificationType,
  Payable,
  PriorityKey,
  Project,
  ProjectDeliverableMetric,
  ProjectSize,
  AdmArea,
  Folder,
  ProjectMember,
  ProjectStageKey,
  ProjectType,
  ProjectTypeTaskTemplate,
  Proposal,
  ProposalInstallment,
  QuoteStageKey,
  Receivable,
  Resource,
  Role,
  ShareLink,
  Specialty,
  Sprint,
  Task,
  TaskStatusKey,
  User,
  VaultItem,
  FileCategory,
} from "./types";
import { PROJECT_STAGES } from "./reference";
import { CLIENT_LINK_DEFAULTS } from "./defaults";

export const SEED_VERSION = 9;
const ORG = "org_draw";

/* ───────────── PRNG determinístico ───────────── */
let s = 20261121;
const rand = () => {
  s = (s * 1664525 + 1013904223) % 4294967296;
  return s / 4294967296;
};
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;

let idc = 0;
const sid = (prefix: string) => `${prefix}_${(++idc).toString(36).padStart(5, "0")}`;

const DAY = 86_400_000;
let NOW = Date.now();
const d = (offsetDays: number, hour = 13) => {
  const date = new Date(NOW + offsetDays * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

const base = (prefix: string, createdOffset = -60, createdBy: ID | null = "usr_paula"): BaseEntity => ({
  id: sid(prefix),
  organizationId: ORG,
  createdAt: d(createdOffset),
  updatedAt: d(Math.min(0, createdOffset + int(0, 20))),
  createdBy,
  deletedAt: null,
});

const AVATAR_COLORS = ["#3f76ff", "#0fa37f", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#4d7c0f"];

/* ───────────── CNPJ válido ───────────── */
function cnpj(): string {
  const n = Array.from({ length: 8 }, () => int(0, 9)).concat([0, 0, 0, 1]);
  const calc = (digits: number[], weights: number[]) => {
    const sum = digits.reduce((acc, dg, i) => acc + dg * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc([...n, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const all = [...n, d1, d2].join("");
  return `${all.slice(0, 2)}.${all.slice(2, 5)}.${all.slice(5, 8)}/${all.slice(8, 12)}-${all.slice(12)}`;
}

const sha = () => Array.from({ length: 64 }, () => "0123456789abcdef"[int(0, 15)]).join("");

/** Estrutura de pastas da Draw (Drive). Raízes fixas = `systemKey`. */
const FOLDER_ADM_DOCS = "fld_adm_docs";
const ROOT_FOLDERS: [string, string, string[]][] = [
  ["projetos", "01. Projetos", []],
  ["vendas", "02. Vendas", ["Propostas modelo", "Apresentações comerciais"]],
  ["financeiro", "03. Financeiro", ["Notas fiscais", "Extratos"]],
  ["adm", "04. Adm & Operacional", ["Documentos institucionais", "Contratos"]],
  ["marketing", "05. Marketing", ["Posts", "Cases"]],
  ["design", "06. Design", ["Templates", "Biblioteca de ícones"]],
  ["cerebro_draw", "07. Cérebro Draw", ["Playbooks", "Aprendizados"]],
  ["cerebro_paula", "08. Cérebro Paula", []],
  ["estrategia", "10. Estratégia", []],
  ["juridico_rh", "11. Jurídico & RH", []],
  ["eventos", "Eventos 2026", []],
  ["planilha_marina", "Planilha Projetos Marina e equipe", []],
];

export function createSeed(): Database {
  s = 20261121;
  idc = 0;
  NOW = Date.now();

  /* ───────── Usuários ───────── */
  const userDefs: [string, string, Role, string, string | null][] = [
    ["usr_paula", "Paula Andrade", "admin", "paula@draw.com.br", "CEO"],
    ["usr_beatriz", "Beatriz Lima", "gestao", "beatriz@draw.com.br", "Gerente de operações"],
    ["usr_carlos", "Carlos Mendes", "comercial", "carlos@draw.com.br", "Comercial"],
    ["usr_fernanda", "Fernanda Rocha", "financeiro", "fernanda@draw.com.br", "Financeiro"],
    ["usr_lucas", "Lucas Prado", "operacao", "lucas@draw.com.br", "Designer sênior"],
    ["usr_marina", "Marina Costa", "operacao", "marina@draw.com.br", "Roteirista"],
    ["usr_rafael", "Rafael Souza", "operacao", "rafael@draw.com.br", "Legal designer"],
    ["usr_julia", "Júlia Martins", "freelancer", "julia.martins@gmail.com", "Designer freelancer"],
    ["usr_pedro", "Pedro Albuquerque", "freelancer", "pedro.alb@outlook.com", "Roteirista freelancer"],
  ];
  const users: User[] = userDefs.map(([id, name, role, email, jobTitle], i) => ({
    ...base("usr", -200),
    id,
    name,
    email,
    role,
    jobTitle,
    userType: role === "freelancer" ? "freelancer" : "internal",
    status: "ativo",
    avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
    phone: `(11) 9${int(1000, 9999)}-${int(1000, 9999)}`,
    mfaEnabled: role === "admin",
    lastLoginAt: d(-int(0, 3)),
    passwordMock: "draw123",
  }));
  // Conta de administração do ambiente publicado (credencial no README → "Acesso").
  users.unshift({
    ...base("usr", -400),
    id: "usr_admin",
    name: "Administrador Draw",
    email: "admin@drawthelaw.com.br",
    role: "admin",
    jobTitle: "Administração da plataforma",
    userType: "internal",
    status: "ativo",
    avatarColor: AVATAR_COLORS[0],
    phone: null,
    mfaEnabled: false,
    lastLoginAt: null,
    passwordMock: process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "draw123",
  });
  users.push({
    ...base("usr", -3),
    id: "usr_convite",
    name: "Thiago Ramos",
    email: "thiago@draw.com.br",
    role: "operacao",
    jobTitle: "Designer",
    userType: "internal",
    status: "convidado",
    avatarColor: AVATAR_COLORS[6],
    phone: null,
    mfaEnabled: false,
    lastLoginAt: null,
    passwordMock: "",
  });
  const internalIds = ["usr_lucas", "usr_marina", "usr_rafael", "usr_beatriz"];

  /* ───────── Freelancers ───────── */
  const flDefs: [string, Specialty[], ID | null][] = [
    ["Júlia Martins", ["design"], "usr_julia"],
    ["Pedro Albuquerque", ["roteiro"], "usr_pedro"],
    ["Ana Clara Vieira", ["design"], null],
    ["Bruno Tavares", ["juridico"], null],
    ["Camila Nogueira", ["roteiro", "juridico"], null],
    ["Diego Fontes", ["design"], null],
    ["Elisa Barros", ["design", "outro"], null],
    ["Felipe Moura", ["juridico"], null],
    ["Gabriela Teixeira", ["roteiro"], null],
    ["Henrique Dias", ["design"], null],
    ["Isabela Freitas", ["juridico", "roteiro"], null],
    ["João Pedro Lins", ["outro"], null],
    ["Larissa Campos", ["design"], null],
    ["Mateus Ribeiro", ["roteiro"], null],
  ];
  const freelancers: Freelancer[] = flDefs.map(([name, specialties, userId], i) => {
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(" ");
    return {
      ...base("fl", -180),
      userId,
      name,
      email: userId ? users.find((u) => u.id === userId)!.email : `${slug[0]}.${slug[slug.length - 1]}@gmail.com`,
      phone: `(${pick(["11", "21", "31", "41"])}) 9${int(1000, 9999)}-${int(1000, 9999)}`,
      legalName: chance(0.6) ? `${name} ME` : name,
      document: chance(0.5)
        ? `${int(100, 999)}.${int(100, 999)}.${int(100, 999)}-${int(10, 99)}`
        : cnpj(),
      pixKey: chance(0.7) ? `${slug[0]}.${slug[slug.length - 1]}@gmail.com` : null,
      bankName: pick(["Nubank", "Itaú", "Inter", "Banco do Brasil", "Bradesco"]),
      bankAgency: `${int(1000, 9999)}`,
      bankAccount: `${int(10000, 99999)}-${int(0, 9)}`,
      jobTitle: specialties.includes("juridico")
        ? pick(["Advogado revisor", "Redator jurídico"])
        : specialties.includes("design")
          ? pick(["Designer gráfico", "Designer de informação", "Ilustrador", "Diagramador"])
          : specialties.includes("roteiro")
            ? pick(["Roteirista", "UX writer"])
            : pick(["Revisor de texto", "Pesquisador"]),
      specialties,
      status: i === 13 ? "inativo" : "ativo",
      notes: i === 2 ? "Excelente com infográficos e ilustração." : null,
      avatarColor: AVATAR_COLORS[(i + 3) % AVATAR_COLORS.length],
    };
  });

  /* ───────── Tipos de projeto e modelos ───────── */
  const typeDefs: [string, string, string, string][] = [
    ["Memorial jurídico", "MEM", "Peça de Design Law que traduz argumentos jurídicos em narrativa visual.", "scale"],
    ["Apresentação", "APR", "Deck institucional, comercial ou para sustentação oral.", "presentation"],
    ["Contrato visual", "CTV", "Contrato reescrito em linguagem simples com recursos visuais.", "file-signature"],
    ["Infográfico", "INF", "Peça única que explica um processo ou dado.", "chart-pie"],
    ["Cartilha", "CAR", "Material educativo de várias páginas para público leigo.", "book-open"],
    ["Relatório visual", "REL", "Relatório anual, ESG ou de impacto com design editorial.", "file-bar-chart"],
  ];
  const projectTypes: ProjectType[] = typeDefs.map(([name, codePrefix, description, icon]) => ({
    ...base("pt", -300),
    name,
    codePrefix,
    description,
    icon,
    active: true,
  }));

  const templateTitles: Partial<Record<ProjectStageKey, string[]>> = {
    roteiro: ["Reunião de kickoff", "Levantar materiais do cliente", "Escrever roteiro", "Revisão jurídica do roteiro"],
    ajustes_roteiro: ["Aplicar ajustes do roteiro", "Enviar roteiro para validação"],
    design: ["Definir direção de arte", "Diagramar peça", "Ilustrações e ícones"],
    ajustes_design: ["Aplicar ajustes de design"],
    validacao_cliente: ["Revisão final e checklist", "Enviar para validação do cliente", "Exportar entregáveis"],
  };
  const projectTypeTaskTemplates: ProjectTypeTaskTemplate[] = [];
  for (const pt of projectTypes) {
    let order = 0;
    for (const stage of PROJECT_STAGES) {
      for (const title of templateTitles[stage.key] ?? []) {
        if (pt.codePrefix === "INF" && title === "Revisão jurídica do roteiro") continue;
        projectTypeTaskTemplates.push({
          ...base("ptt", -300),
          projectTypeId: pt.id,
          stageKey: stage.key,
          title,
          order: ++order,
          defaultDurationDays: stage.key === "design" ? 5 : 3,
        });
      }
    }
  }

  /* ───────── Clientes ───────── */
  const clientGroups: ClientGroup[] = [
    { ...base("grp", -300), name: "Grupo Aurora" },
    { ...base("grp", -300), name: "Holding Vértice" },
    { ...base("grp", -300), name: "Rede Saúde Integrada" },
  ];
  const clientDefs: [string, string, string, number | null][] = [
    ["Machado & Pires Advogados", "Machado Pires", "Escritório de advocacia", null],
    ["Aurora Energia S.A.", "Aurora Energia", "Energia", 0],
    ["Aurora Renováveis Ltda.", "Aurora Renováveis", "Energia", 0],
    ["Vértice Construções S.A.", "Vértice", "Construção civil", 1],
    ["Vértice Incorporadora Ltda.", "Vértice Incorporadora", "Imobiliário", 1],
    ["Banco Horizonte S.A.", "Banco Horizonte", "Financeiro", null],
    ["Hospital Santa Clara Ltda.", "Santa Clara", "Saúde", 2],
    ["Clínica Bem Viver Ltda.", "Bem Viver", "Saúde", 2],
    ["Lemos, Freitas e Associados", "Lemos Freitas", "Escritório de advocacia", null],
    ["Nexo Tecnologia Ltda.", "Nexo", "Tecnologia", null],
    ["Cooperativa Agro Sul", "Agro Sul", "Agronegócio", null],
    ["Instituto Semear", "Semear", "Terceiro setor", null],
    ["Fintech Lume Pagamentos S.A.", "Lume", "Financeiro", null],
    ["Varejo Ponto Certo Ltda.", "Ponto Certo", "Varejo", null],
    ["Tribunal de Justiça — Escola Judicial", "Escola Judicial TJ", "Setor público", null],
    ["Barros Mello Sociedade de Advogados", "Barros Mello", "Escritório de advocacia", null],
    ["Seguradora Atlântica S.A.", "Atlântica Seguros", "Seguros", null],
    ["Logística Rota Norte Ltda.", "Rota Norte", "Logística", null],
    ["Editora Página Viva Ltda.", "Página Viva", "Educação", null],
    ["Startup Juris.ai Ltda.", "Juris.ai", "Tecnologia", null],
  ];
  const cities: [string, string][] = [
    ["São Paulo", "SP"],
    ["Rio de Janeiro", "RJ"],
    ["Belo Horizonte", "MG"],
    ["Curitiba", "PR"],
    ["Porto Alegre", "RS"],
    ["Brasília", "DF"],
  ];
  const clients: Client[] = clientDefs.map(([legalName, tradeName, segment, g], i) => {
    const [city, state] = pick(cities);
    return {
      ...base("cli", -280 + i),
      groupId: g === null ? null : clientGroups[g].id,
      legalName,
      tradeName,
      cnpj: cnpj(),
      address: {
        street: pick(["Av. Paulista", "Rua da Consolação", "Av. Brigadeiro Faria Lima", "Rua XV de Novembro", "Av. Afonso Pena"]),
        number: `${int(10, 3000)}`,
        complement: chance(0.5) ? `Sala ${int(100, 2200)}` : null,
        district: pick(["Centro", "Bela Vista", "Pinheiros", "Savassi", "Batel"]),
        city,
        state,
        zip: `${int(10000, 99999)}-${int(100, 999)}`,
      },
      segment,
      status: i >= 18 ? "prospect" : "ativo",
      notes: i === 0 ? "Cliente desde 2021. Prefere reuniões presenciais." : null,
      paymentTermsNote: pick(["20 dias após emissão da nota fiscal.", "30 dias após emissão da NF, pagamento às quintas.", "15 dias após aprovação da entrega.", null]),
      paymentTermDays: pick([20, 30, 15, null]),
    };
  });

  const firstNames = ["Ricardo", "Patrícia", "Eduardo", "Renata", "Gustavo", "Aline", "Marcelo", "Tatiane", "André", "Vanessa", "Rodrigo", "Juliana"];
  const lastNames = ["Silva", "Oliveira", "Santos", "Pereira", "Almeida", "Carvalho", "Gomes", "Ribeiro", "Martins", "Araújo"];
  const clientContacts: ClientContact[] = [];
  for (const c of clients) {
    const n = int(1, 3);
    for (let i = 0; i < n; i++) {
      const fn = pick(firstNames);
      const ln = pick(lastNames);
      const domain = c.tradeName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
      clientContacts.push({
        ...base("cct", -270),
        clientId: c.id,
        name: `${fn} ${ln}`,
        email: `${fn.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${ln.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@${domain}.com.br`,
        phone: `(11) 3${int(100, 999)}-${int(1000, 9999)}`,
        jobTitle: i === 0 ? pick(["Diretor jurídico", "Sócia", "Gerente de marketing", "Head de comunicação"]) : pick(["Analista financeiro", "Coordenadora", "Assistente jurídico"]),
        isBillingContact: i === (n > 1 ? 1 : 0),
        isDecisionMaker: i === 0,
      });
    }
  }

  /* ───────── Projetos ───────── */
  const codeSequences: Record<string, number> = {};
  const nextCode = (prefix: string) => {
    codeSequences[prefix] = (codeSequences[prefix] ?? 0) + 1;
    return `${prefix}-${String(codeSequences[prefix]).padStart(3, "0")}`;
  };

  const titlesByType: Record<string, string[]> = {
    MEM: ["Memorial de sustentação — ação coletiva", "Memorial recurso especial tributário", "Memorial arbitragem societária", "Memorial ação civil pública ambiental", "Memorial disputa de marca", "Memorial licitação de infraestrutura"],
    APR: ["Deck institucional 2027", "Apresentação para investidores", "Pitch para conselho", "Apresentação de resultados trimestrais"],
    CTV: ["Contrato de prestação de serviços simplificado", "Termos de uso em linguagem simples", "Contrato de trabalho visual"],
    INF: ["Infográfico do fluxo de compliance", "Infográfico jornada do paciente", "Infográfico processo de licenciamento"],
    CAR: ["Cartilha LGPD para colaboradores", "Cartilha do código de conduta", "Cartilha de direitos do consumidor"],
    REL: ["Relatório ESG 2026", "Relatório de impacto social", "Relatório anual de sustentabilidade"],
  };

  const projects: Project[] = [];
  const proposals: Proposal[] = [];
  const proposalInstallments: ProposalInstallment[] = [];
  const projectMembers: ProjectMember[] = [];
  const tasks: Task[] = [];
  const receivables: Receivable[] = [];
  const payables: Payable[] = [];
  const comments: Comment[] = [];
  const approvals: Approval[] = [];
  const files: FileEntity[] = [];
  const fileVersions: FileVersion[] = [];
  const events: DomainEvent[] = [];
  const shareLinks: ShareLink[] = [];
  const freelancerInvoiceRequests: FreelancerInvoiceRequest[] = [];
  const milestones: Milestone[] = [];
  const projectDeliverableMetrics: ProjectDeliverableMetric[] = [];
  const notifications: Notification[] = [];

  const ev = (type: string, entityType: string, entityId: ID, p: Project | null, actorId: ID | null, data: Record<string, unknown>, at: string) => {
    events.push({
      ...base("ev", 0, actorId),
      createdAt: at,
      updatedAt: at,
      entityType,
      entityId,
      projectId: p?.id ?? null,
      clientId: p?.clientId ?? null,
      actorId,
      type,
      data,
      occurredAt: at,
    });
  };

  const addFile = (p: Project | null, name: string, category: FileCategory, mime: string, offset: number, released = false, versions = 1) => {
    const fileId = sid("file");
    let current = "";
    for (let v = 1; v <= versions; v++) {
      const fv: FileVersion = {
        ...base("fv", offset + v),
        fileId,
        version: v,
        storageKey: `org_draw/${p?.id ?? "adm"}/${fileId}/v${v}`,
        size: int(80_000, 9_000_000),
        mime,
        sha256: sha(),
        uploadedBy: pick(["usr_lucas", "usr_marina", "usr_paula", "usr_beatriz"]),
        note: v > 1 ? pick(["Ajustes solicitados pelo cliente", "Correção de texto", "Nova paleta"]) : null,
        dataUrl: null,
      };
      fileVersions.push(fv);
      current = fv.id;
    }
    files.push({
      ...base("file", offset),
      id: fileId,
      projectId: p?.id ?? null,
      clientId: p?.clientId ?? null,
      module: p ? "projeto" : "adm",
      taskId: null,
      category,
      name,
      currentVersionId: current,
      releasedToFreelancers: released,
      folderId: p ? null : FOLDER_ADM_DOCS,
    });
    return fileId;
  };

  type Plan = {
    status: Project["status"];
    quote?: QuoteStageKey;
    stage?: ProjectStageKey;
    origin: Project["origin"];
  };
  const plans: Plan[] = [
    ...(["entrada", "entrada", "diagnostico", "elaboracao", "elaboracao", "enviada", "enviada", "negociacao", "negociacao"] as QuoteStageKey[]).map(
      (q) => ({ status: "cotacao" as const, quote: q, origin: "cotacao" as const }),
    ),
    { status: "perdido", quote: "perdida", origin: "cotacao" },
    { status: "perdido", quote: "perdida", origin: "cotacao" },
    ...(["roteiro", "roteiro", "roteiro", "roteiro", "ajustes_roteiro", "ajustes_roteiro", "design", "design", "design", "design", "ajustes_design", "ajustes_design", "validacao_cliente", "validacao_cliente", "roteiro", "design"] as ProjectStageKey[]).map(
      (st, i) => ({ status: "ativo" as const, stage: st, origin: i % 4 === 3 ? ("direto" as const) : ("cotacao" as const) }),
    ),
    ...Array.from({ length: 9 }, (_, i) => ({ status: "concluido" as const, stage: "concluido" as ProjectStageKey, origin: i % 3 === 0 ? ("direto" as const) : ("cotacao" as const) })),
    { status: "arquivado", stage: "concluido", origin: "cotacao" },
    { status: "arquivado", stage: "concluido", origin: "direto" },
  ];

  const typeOrder = ["MEM", "MEM", "APR", "CTV", "MEM", "INF", "CAR", "REL", "APR", "MEM"];
  const usedTitles = new Set<string>();

  plans.forEach((plan, idx) => {
    const typeCode = typeOrder[idx % typeOrder.length];
    const pt = projectTypes.find((t) => t.codePrefix === typeCode)!;
    const client = clients[(idx * 7) % 18];
    let title = pick(titlesByType[typeCode]);
    if (usedTitles.has(title + client.id)) title = `${title} (fase 2)`;
    usedTitles.add(title + client.id);

    const isQuote = plan.status === "cotacao" || plan.status === "perdido";
    const isDone = plan.status === "concluido" || plan.status === "arquivado";
    const enteredOffset = isDone ? -int(90, 220) : isQuote ? -int(3, 40) : -int(20, 75);
    const quoteSentOffset = plan.origin === "cotacao" ? enteredOffset + int(3, 10) : null;
    const approvedOffset = plan.status === "cotacao" || plan.status === "perdido" ? null : plan.origin === "direto" ? enteredOffset : (quoteSentOffset ?? enteredOffset) + int(2, 12);
    const completedOffset = isDone ? -int(5, 70) : null;
    const dueOffset = isQuote ? null : isDone ? completedOffset! + int(-6, 8) : int(-6, 35);
    const ownerId = plan.status === "cotacao" || plan.status === "perdido" ? pick(["usr_carlos", "usr_paula", "usr_beatriz"]) : pick(["usr_beatriz", "usr_lucas", "usr_marina", "usr_rafael"]);
    const contracted = int(8, 85) * 100_000;
    const billing = clientContacts.find((c) => c.clientId === client.id && c.isBillingContact);

    const p: Project = {
      ...base("prj", enteredOffset, ownerId),
      clientId: client.id,
      projectTypeId: pt.id,
      code: nextCode(pt.codePrefix),
      title,
      briefing:
        typeCode === "MEM"
          ? "Traduzir os principais argumentos da peça em narrativa visual de até 12 páginas, com linha do tempo dos fatos e quadro comparativo de precedentes. Público: desembargadores."
          : "Peça com linguagem simples e identidade visual do cliente. Entregar PDF interativo e versão para impressão.",
      origin: plan.origin,
      status: plan.status,
      quoteStageKey: isQuote ? plan.quote! : null,
      projectStageKey: isQuote ? null : plan.stage!,
      priorityKey: pick<PriorityKey>(["baixa", "media", "media", "alta", "alta", "urgente"]),
      position: idx * 1000,
      ownerId,
      billingContactId: billing?.id ?? null,
      enteredAt: d(enteredOffset),
      quoteSentAt: quoteSentOffset !== null && (!isQuote || ["enviada", "negociacao", "perdida"].includes(plan.quote!)) ? d(quoteSentOffset) : null,
      approvedAt: approvedOffset !== null ? d(approvedOffset) : null,
      startedAt: approvedOffset !== null ? d(approvedOffset + 1) : null,
      dueAt: dueOffset !== null ? d(dueOffset, 20) : isQuote && chance(0.5) ? d(int(5, 30), 20) : null,
      estimatedEndAt: dueOffset !== null ? d(dueOffset - int(0, 3), 20) : null,
      completedAt: completedOffset !== null ? d(completedOffset) : null,
      archivedAt: plan.status === "arquivado" ? d(completedOffset! + 10) : null,
      contractedAmountCents: isQuote ? null : contracted,
      lostReason: plan.status === "perdido" ? pick(["Preço acima do orçamento do cliente", "Cliente optou por fazer internamente"]) : null,
      isEnvironment: false,
      size: pick<ProjectSize>(["pequeno", "pequeno", "medio", "medio", "grande"]),
      pausedAt: plan.status === "ativo" && idx % 9 === 4 ? d(-int(2, 9)) : null,
      pausedReason: plan.status === "ativo" && idx % 9 === 4 ? "Aguardando material do cliente" : null,
      legacyCode: isDone ? `P${String(idx + 1).padStart(3, "0")}` : null,
      paymentCondition: isQuote ? null : contracted > 3_000_000 ? "50_50" : "a_vista",
      statusBeforeArchive: plan.status === "arquivado" ? "concluido" : null,
    };
    projects.push(p);
    ev("project.created", "project", p.id, p, ownerId, { origin: p.origin, status: isQuote ? "cotacao" : "ativo" }, p.enteredAt);

    /* proposta */
    if (plan.origin === "cotacao" && (!isQuote || ["elaboracao", "enviada", "negociacao", "perdida"].includes(plan.quote!))) {
      const versions = plan.quote === "negociacao" || (!isQuote && chance(0.4)) ? 2 : 1;
      for (let v = 1; v <= versions; v++) {
        const last = v === versions;
        const amount = last && !isQuote ? contracted : int(8, 90) * 100_000;
        const status: Proposal["status"] = !last
          ? "recusada"
          : !isQuote
            ? "aprovada"
            : plan.quote === "elaboracao"
              ? "rascunho"
              : plan.quote === "perdida"
                ? "recusada"
                : "enviada";
        const fileId = addFile(p, `Proposta ${p.code} v${v}.pdf`, "proposta", "application/pdf", enteredOffset + 2);
        const prop: Proposal = {
          ...base("prop", enteredOffset + 2, "usr_carlos"),
          projectId: p.id,
          version: v,
          amountCents: amount,
          paymentTermsNote: amount > 3_000_000 ? "50% na aprovação, 50% na entrega" : "100% na entrega",
          status,
          sentAt: status !== "rascunho" ? (p.quoteSentAt ?? d(enteredOffset + 4)) : null,
          approvedAt: status === "aprovada" ? p.approvedAt : null,
          fileId,
        };
        proposals.push(prop);
        const nInst = amount > 3_000_000 ? 2 : 1;
        for (let n = 1; n <= nInst; n++) {
          proposalInstallments.push({
            ...base("inst", enteredOffset + 2),
            proposalId: prop.id,
            number: n,
            amountCents: Math.round(amount / nInst),
            dueRule: nInst === 1 ? "Na entrega" : n === 1 ? "Na aprovação" : "Na entrega",
            dueAt: null,
          });
        }
        if (status !== "rascunho") ev("proposal.sent", "proposal", prop.id, p, "usr_carlos", { version: v, amountCents: amount }, prop.sentAt!);
        if (status === "aprovada") ev("proposal.approved", "proposal", prop.id, p, "usr_paula", { version: v, amountCents: amount }, prop.approvedAt!);
      }
    }
    if (plan.status === "perdido") ev("project.lost", "project", p.id, p, "usr_carlos", { reason: p.lostReason }, d(enteredOffset + 15));

    /* recebíveis */
    if (!isQuote) {
      const approvedProp = proposals.find((pr) => pr.projectId === p.id && pr.status === "aprovada");
      const insts = approvedProp ? proposalInstallments.filter((i) => i.proposalId === approvedProp.id) : [];
      const parts = insts.length ? insts.map((i) => ({ id: i.id as ID | null, amount: i.amountCents, rule: i.dueRule })) : contracted > 3_000_000 ? [{ id: null, amount: contracted / 2, rule: "Na aprovação" }, { id: null, amount: contracted / 2, rule: "Na entrega" }] : [{ id: null, amount: contracted, rule: "Na entrega" }];
      parts.forEach((part, n) => {
        const onApproval = part.rule === "Na aprovação";
        const expectedOffset = onApproval ? approvedOffset! + 5 : (dueOffset ?? 30) + 10;
        let status: Receivable["status"] = "previsto";
        if (isDone || onApproval) status = chance(0.8) ? "recebido" : "faturado";
        if (status === "previsto" && expectedOffset < 0) status = "vencido";
        if (status === "faturado" && expectedOffset < -10) status = "vencido";
        const issued = status !== "previsto";
        const rec: Receivable = {
          ...base("rec", approvedOffset!),
          projectId: p.id,
          clientId: p.clientId,
          proposalInstallmentId: part.id,
          description: parts.length > 1 ? `Parcela ${n + 1}/${parts.length} — ${part.rule}` : "Parcela única — na entrega",
          amountCents: Math.round(part.amount),
          taxCents: Math.round(part.amount * 0.06),
          kind: "parcela",
          collectionNote: status === "vencido" ? "Cobrado por e-mail; cliente pediu nova data" : status === "recebido" ? "Recebido" : null,
          expectedAt: d(expectedOffset),
          invoiceNumber: issued ? `${int(1000, 9999)}` : null,
          invoiceFileId: issued ? addFile(p, `NF ${p.code} parcela ${n + 1}.pdf`, "nf", "application/pdf", expectedOffset - 2) : null,
          issuedAt: issued ? d(expectedOffset - 3) : null,
          receivedAt: status === "recebido" ? d(expectedOffset + int(0, 6)) : null,
          status,
        };
        receivables.push(rec);
      });
    }

    /* equipe */
    const team: ProjectMember[] = [];
    const addMember = (userId: ID | null, freelancerId: ID | null, role: ProjectMember["memberRole"], amount: number | null) => {
      const m: ProjectMember = { ...base("pm", enteredOffset), projectId: p.id, userId, freelancerId, memberRole: role, agreedAmountCents: amount, active: true };
      projectMembers.push(m);
      team.push(m);
      return m;
    };
    addMember(ownerId, null, "responsavel", null);
    if (!isQuote) {
      const internal = pick(internalIds.filter((i) => i !== ownerId));
      addMember(internal, null, internal === "usr_marina" ? "roteirista" : internal === "usr_rafael" ? "advogado" : "designer", null);
      const designers = freelancers.filter((f) => f.specialties.includes("design") && f.status === "ativo");
      const writers = freelancers.filter((f) => (f.specialties.includes("roteiro") || f.specialties.includes("juridico")) && f.status === "ativo");
      const fd = idx % 5 === 0 ? freelancers[0] : pick(designers);
      addMember(null, fd.id, "designer", Math.round((contracted * 0.18) / 10_000) * 10_000);
      if (chance(0.6) || idx % 6 === 1) {
        const fw = idx % 6 === 1 ? freelancers[1] : pick(writers);
        addMember(null, fw.id, fw.specialties.includes("juridico") ? "advogado" : "roteirista", Math.round((contracted * 0.12) / 10_000) * 10_000);
      }
    }

    /* tarefas */
    const assignable = team.map((m) => ({ userId: m.userId, freelancerId: m.freelancerId, role: m.memberRole }));
    const pickAssignee = (stageKey: string) => {
      const prefer = stageKey.includes("roteiro") ? ["roteirista", "advogado"] : stageKey.includes("design") ? ["designer"] : ["responsavel"];
      const opts = assignable.filter((a) => prefer.includes(a.role));
      return opts.length ? pick(opts) : assignable[0];
    };
    if (isQuote) {
      const qTasks = ["Reunião de diagnóstico", "Elaborar proposta", "Enviar proposta", "Follow-up com o cliente"];
      const stageIdx = ["entrada", "diagnostico", "elaboracao", "enviada", "negociacao", "aprovada", "perdida"].indexOf(plan.quote!);
      qTasks.forEach((t, i) => {
        const done = i < stageIdx;
        tasks.push({
          ...base("tsk", enteredOffset + i, ownerId),
          projectId: p.id,
          module: "projeto",
          parentTaskId: null,
          stageKey: (["diagnostico", "elaboracao", "enviada", "negociacao"] as QuoteStageKey[])[i],
          title: t,
          description: null,
          assigneeUserId: ownerId,
          assigneeFreelancerId: null,
          statusKey: done ? "concluida" : i === stageIdx ? "em_andamento" : "a_fazer",
          priorityKey: p.priorityKey,
          startAt: d(enteredOffset + i * 2),
          dueAt: d(enteredOffset + i * 3 + int(2, 10), 20),
          estimateMinutes: int(1, 6) * 30,
          position: i * 1000,
          sprintId: null,
          completedAt: done ? d(enteredOffset + i * 3) : null,
          area: null,
        });
      });
    } else {
      const currentOrder = PROJECT_STAGES.find((st) => st.key === p.projectStageKey)!.order;
      const tpl = projectTypeTaskTemplates.filter((t) => t.projectTypeId === pt.id).sort((a, b) => a.order - b.order);
      const span = Math.max(1, (dueOffset ?? 30) - (approvedOffset ?? 0));
      tpl.forEach((t, i) => {
        const stOrder = PROJECT_STAGES.find((st) => st.key === t.stageKey)!.order;
        const status: TaskStatusKey = isDone || stOrder < currentOrder ? "concluida" : stOrder === currentOrder ? (i % 2 === 0 ? "em_andamento" : chance(0.5) ? "em_revisao" : "a_fazer") : "a_fazer";
        const a = pickAssignee(t.stageKey);
        let start = (approvedOffset ?? 0) + Math.floor((span * i) / tpl.length);
        let due = start + t.defaultDurationDays;
        // tarefas abertas: prazos realistas (poucas atrasadas, a maioria à frente)
        if (status !== "concluida") {
          due = stOrder === currentOrder ? Math.max(due, chance(0.25) ? int(-4, -1) : int(0, 8)) : Math.max(due, int(4, 12) + (stOrder - currentOrder) * 5);
          start = Math.min(start, due - t.defaultDurationDays);
        }
        const task: Task = {
          ...base("tsk", (approvedOffset ?? 0) + 1, "usr_beatriz"),
          projectId: p.id,
          module: "projeto",
          parentTaskId: null,
          stageKey: t.stageKey,
          title: t.title,
          description: t.title === "Diagramar peça" ? "Seguir o grid de 12 colunas do manual da marca. Usar a paleta aprovada no kickoff." : null,
          assigneeUserId: a.userId,
          assigneeFreelancerId: a.freelancerId,
          statusKey: status,
          priorityKey: chance(0.2) ? "alta" : p.priorityKey === "urgente" ? "alta" : "media",
          startAt: d(start),
          dueAt: d(due, 20),
          estimateMinutes: int(2, 16) * 30,
          position: i * 1000,
          sprintId: null,
          completedAt: status === "concluida" ? d(Math.min(due, -1)) : null,
          area: null,
        };
        tasks.push(task);
        if (t.title === "Diagramar peça" || t.title === "Escrever roteiro") {
          const subs = t.title === "Diagramar peça" ? ["Capa e sumário", "Páginas de argumento", "Linha do tempo", "Quadro de precedentes"] : ["Estrutura narrativa", "Primeira versão", "Revisão de linguagem"];
          subs.forEach((sub, j) => {
            const subDone = status === "concluida" || (status !== "a_fazer" && j < subs.length / 2);
            tasks.push({
              ...task,
              ...base("tsk", (approvedOffset ?? 0) + 1),
              parentTaskId: task.id,
              title: sub,
              description: null,
              statusKey: subDone ? "concluida" : "a_fazer",
              position: j * 1000,
              estimateMinutes: 60,
              completedAt: subDone ? d(Math.min(due, -1)) : null,
            });
          });
        }
      });

      /* histórico de etapas */
      let at = approvedOffset ?? enteredOffset;
      const reached = PROJECT_STAGES.filter((st) => st.order <= currentOrder);
      reached.forEach((st, i) => {
        if (i === 0) return;
        at += int(2, 7);
        ev("project.stage_changed", "project", p.id, p, pick(["usr_beatriz", "usr_lucas", "usr_marina"]), { from: reached[i - 1].key, to: st.key }, d(Math.min(at, completedOffset ?? -1)));
      });
      if (p.origin === "direto") ev("project.direct_created", "project", p.id, p, ownerId, { contractedAmountCents: contracted }, p.enteredAt);
      if (isDone) ev("project.completed", "project", p.id, p, "usr_beatriz", {}, p.completedAt!);
      if (plan.status === "arquivado") ev("project.archived", "project", p.id, p, "usr_paula", {}, p.archivedAt!);

      /* aprovações */
      if (currentOrder >= 3) {
        const decided = currentOrder > 2;
        approvals.push({
          ...base("apr", (approvedOffset ?? 0) + 8),
          projectId: p.id,
          stageKey: "ajustes_roteiro",
          requestedFrom: clientContacts.find((c) => c.clientId === p.clientId)?.name ?? "Cliente",
          decision: decided ? (chance(0.3) ? "ajustes" : "aprovado") : "pendente",
          reason: decided && chance(0.3) ? "Ajustar tom do segundo capítulo" : null,
          decidedBy: decided ? "usr_beatriz" : null,
          decidedAt: decided ? d((approvedOffset ?? 0) + 12) : null,
          requestedBy: p.ownerId,
          shareLinkId: null,
          decidedVia: decided ? "interno" : null,
          decidedByName: null,
        });
      }
      if (currentOrder >= 5) {
        const decided = currentOrder > 5;
        approvals.push({
          ...base("apr", (approvedOffset ?? 0) + 18),
          projectId: p.id,
          stageKey: "validacao_cliente",
          requestedFrom: clientContacts.find((c) => c.clientId === p.clientId)?.name ?? "Cliente",
          decision: decided ? "aprovado" : "pendente",
          reason: null,
          decidedBy: decided ? "usr_paula" : null,
          decidedAt: decided ? (p.completedAt ?? d(-1)) : null,
          requestedBy: null,
          shareLinkId: null,
          decidedVia: decided ? "interno" : null,
          decidedByName: null,
        });
      }

      /* arquivos */
      addFile(p, "Briefing do cliente.pdf", "briefing", "application/pdf", (approvedOffset ?? 0) + 1, true);
      addFile(p, `Manual de marca — ${client.tradeName}.pdf`, "marca_cliente", "application/pdf", (approvedOffset ?? 0) + 1, true);
      if (chance(0.5)) addFile(p, "Tom de voz.docx", "marca_cliente", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", (approvedOffset ?? 0) + 2, true);
      if (currentOrder >= 2) addFile(p, `Roteiro ${p.code}.docx`, "entrega", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", (approvedOffset ?? 0) + 6, false, currentOrder >= 3 ? 2 : 1);
      if (currentOrder >= 4) addFile(p, `${p.code} — peça final.pdf`, "entrega", "application/pdf", (approvedOffset ?? 0) + 15, false, isDone ? 3 : 1);
      if (currentOrder >= 3) addFile(p, "Referências visuais.png", "outro", "image/png", (approvedOffset ?? 0) + 9, true);

      /* comentários */
      const commentBodies = [
        "Cliente pediu para reforçar a linha do tempo dos fatos na página 3.",
        "Subi a nova versão do roteiro com os ajustes de linguagem.",
        "@Lucas consegue revisar a diagramação até amanhã?",
        "Aprovado internamente. Podemos enviar para validação.",
        "Atenção ao prazo: a audiência foi antecipada.",
      ];
      const nComments = int(1, 4);
      for (let c = 0; c < nComments; c++) {
        const author = pick(team.filter((m) => m.userId)).userId ?? ownerId;
        const body = commentBodies[(idx + c) % commentBodies.length];
        comments.push({
          ...base("cmt", (approvedOffset ?? 0) + 3 + c * 3, author),
          projectId: p.id,
          taskId: null,
          authorId: author,
          body,
          mentions: body.includes("@Lucas") ? ["usr_lucas"] : [],
        });
      }

      /* marcos e métricas (concluídos) */
      if (isDone) {
        milestones.push({ ...base("ms", completedOffset!), projectId: p.id, title: "Entrega da peça final", date: p.completedAt!, learning: "Validar o roteiro com o sócio responsável antes do design reduz retrabalho." });
        if (typeCode === "MEM" || typeCode === "CTV") {
          const before = int(18, 60);
          projectDeliverableMetrics.push(
            { ...base("pdm", completedOffset!), projectId: p.id, metric: "paginas_antes", value: before },
            { ...base("pdm", completedOffset!), projectId: p.id, metric: "paginas_depois", value: Math.round(before * 0.35) },
            { ...base("pdm", completedOffset!), projectId: p.id, metric: "tempo_leitura_antes", value: before * 3 },
            { ...base("pdm", completedOffset!), projectId: p.id, metric: "tempo_leitura_depois", value: Math.round(before * 0.9) },
          );
        }
      }

      /* contas a pagar (RN-03) para concluídos */
      if (isDone) {
        team.filter((m) => m.freelancerId && m.agreedAmountCents).forEach((m, j) => {
          const completed = new Date(p.completedAt!);
          const due = new Date(Date.UTC(completed.getUTCFullYear(), completed.getUTCMonth() + 1, 20, 15));
          const statuses: Payable["status"][] = ["pago", "pago", "aprovado", "em_conferencia", "divergente", "aguardando_nf"];
          const status = idx === plans.length - 12 ? "aguardando_nf" : statuses[(idx + j) % statuses.length];
          const invoiced = status === "aguardando_nf" ? null : status === "divergente" ? m.agreedAmountCents! - 50_000 : m.agreedAmountCents!;
          const pay: Payable = {
            ...base("pay", completedOffset!),
            projectId: p.id,
            kind: "freelancer",
            freelancerId: m.freelancerId,
            projectMemberId: m.id,
            description: `${m.memberRole === "designer" ? "Design" : "Roteiro"} — ${p.code}`,
            agreedAmountCents: m.agreedAmountCents!,
            invoicedAmountCents: invoiced,
            invoiceFileId: invoiced ? addFile(p, `NF freelancer ${p.code}.pdf`, "nf", "application/pdf", completedOffset! + 3) : null,
            invoiceNumber: invoiced ? `${int(100, 999)}` : null,
            dueAt: due.toISOString(),
            paidAt: status === "pago" ? due.toISOString() : null,
            status,
            divergenceNote: status === "divergente" ? "NF emitida com valor R$ 500,00 abaixo do acordado." : null,
          };
          payables.push(pay);
          const link: ShareLink = {
            ...base("shl", completedOffset!),
            token: `nf-${p.code.toLowerCase()}-${j + 1}`,
            purpose: "nf_freelancer",
            projectId: p.id,
            targetId: pay.id,
            expiresAt: d(completedOffset! + 30),
            hasPassword: false,
            maxUses: 3,
            useCount: invoiced ? 1 : 0,
            revokedAt: null,
            ...CLIENT_LINK_DEFAULTS,
            recipients: [freelancers.find((f) => f.id === m.freelancerId)!.email],
            lastSentAt: d(completedOffset!),
          };
          shareLinks.push(link);
          const fl = freelancers.find((f) => f.id === m.freelancerId)!;
          freelancerInvoiceRequests.push({
            ...base("fir", completedOffset!),
            payableId: pay.id,
            shareLinkId: link.id,
            sentAt: p.completedAt!,
            submittedAt: invoiced ? d(completedOffset! + 3) : null,
            declaredLegalName: invoiced ? fl.legalName : null,
            declaredDocument: invoiced ? fl.document : null,
            declaredPixKey: invoiced ? fl.pixKey : null,
            declaredInvoiceNumber: pay.invoiceNumber,
            declaredAmountCents: invoiced,
          });
          ev("payable.created", "payable", pay.id, p, null, { agreedAmountCents: pay.agreedAmountCents }, p.completedAt!);
        });
      }
    }
  });

  /* despesas */
  const someActive = projects.filter((p) => p.status === "ativo").slice(0, 4);
  someActive.forEach((p, i) => {
    payables.push({
      ...base("pay", -10),
      projectId: p.id,
      kind: "despesa_projeto",
      freelancerId: null,
      projectMemberId: null,
      description: pick(["Impressão gráfica", "Banco de imagens", "Tradução juramentada", "Fontes licenciadas"]),
      agreedAmountCents: int(3, 25) * 10_000,
      invoicedAmountCents: null,
      invoiceFileId: null,
      invoiceNumber: null,
      dueAt: d(int(-5, 20)),
      paidAt: i % 2 === 0 ? d(-2) : null,
      status: i % 2 === 0 ? "pago" : "aprovado",
      divergenceNote: null,
    });
  });
  ["Assinatura Adobe Creative Cloud", "Hospedagem VPS", "Contabilidade — mensalidade", "Coworking"].forEach((desc, i) => {
    payables.push({
      ...base("pay", -20),
      projectId: null,
      kind: "despesa_adm",
      freelancerId: null,
      projectMemberId: null,
      description: desc,
      agreedAmountCents: [29_000, 18_000, 120_000, 90_000][i],
      invoicedAmountCents: null,
      invoiceFileId: null,
      invoiceNumber: null,
      dueAt: d(int(-3, 15)),
      paidAt: i < 2 ? d(-1) : null,
      status: i < 2 ? "pago" : "aprovado",
      divergenceNote: null,
    });
  });

  /* ───────── Administrativo ───────── */
  const sprints: Sprint[] = [
    { ...base("spr", -30), name: "Sprint 21", startAt: d(-28), endAt: d(-15), status: "concluida" },
    { ...base("spr", -16), name: "Sprint 22", startAt: d(-14), endAt: d(0), status: "concluida" },
    { ...base("spr", -2), name: "Sprint 23", startAt: d(1), endAt: d(14), status: "ativa" },
    { ...base("spr", -1), name: "Sprint 24", startAt: d(15), endAt: d(28), status: "planejada" },
  ];
  const admTitles = [
    "Renovar certificado digital A1",
    "Atualizar playbook de onboarding de freelancers",
    "Revisar contrato padrão de prestação de serviços",
    "Organizar pasta de cases para o site",
    "Cotação de seguro de responsabilidade civil",
    "Publicar post sobre Legal Design no LinkedIn",
    "Planejar treinamento interno de acessibilidade",
    "Conciliar extrato bancário de outubro",
    "Migrar templates de proposta",
    "Atualizar portfólio no Behance",
    "Revisar política de privacidade do site",
    "Mapear quadros do Monday para migração",
    "Pegar senha de 5 assinaturas do Claude (R$ 660)",
    "Draw The Case Room — portal do cliente",
    "Reunião de alinhamento Draw financeiro",
    "Proposta Nery — follow-up",
    "Calendário editorial de dezembro",
  ];
  const ADM_AREA_OF: Record<string, AdmArea> = {
    "Renovar certificado digital A1": "administrativo",
    "Atualizar playbook de onboarding de freelancers": "administrativo",
    "Revisar contrato padrão de prestação de serviços": "administrativo",
    "Organizar pasta de cases para o site": "comercial_marketing",
    "Cotação de seguro de responsabilidade civil": "financeiro",
    "Publicar post sobre Legal Design no LinkedIn": "comercial_marketing",
    "Planejar treinamento interno de acessibilidade": "projetos_internos",
    "Conciliar extrato bancário de outubro": "financeiro",
    "Migrar templates de proposta": "comercial_marketing",
    "Atualizar portfólio no Behance": "comercial_marketing",
    "Revisar política de privacidade do site": "administrativo",
    "Mapear quadros do Monday para migração": "projetos_internos",
    "Pegar senha de 5 assinaturas do Claude (R$ 660)": "administrativo",
    "Draw The Case Room — portal do cliente": "projetos_internos",
    "Reunião de alinhamento Draw financeiro": "financeiro",
    "Proposta Nery — follow-up": "outros",
    "Calendário editorial de dezembro": "comercial_marketing",
  };
  admTitles.forEach((title, i) => {
    const sprint = i < 3 ? sprints[1] : i < 8 ? sprints[2] : i < 10 ? sprints[3] : null;
    const status: TaskStatusKey = sprint === sprints[1] ? "concluida" : sprint === sprints[2] ? pick(["a_fazer", "em_andamento", "em_revisao", "a_fazer"]) : "a_fazer";
    tasks.push({
      ...base("tsk", -25 + i, "usr_paula"),
      projectId: null,
      module: "adm",
      parentTaskId: null,
      stageKey: null,
      title,
      description: null,
      assigneeUserId: pick(["usr_paula", "usr_beatriz", "usr_fernanda", "usr_carlos"]),
      assigneeFreelancerId: null,
      statusKey: status,
      priorityKey: pick(["baixa", "media", "alta"]),
      startAt: sprint?.startAt ?? null,
      dueAt: sprint ? sprint.endAt : null,
      estimateMinutes: int(1, 8) * 60,
      position: i * 1000,
      sprintId: sprint?.id ?? null,
      completedAt: status === "concluida" ? d(-3) : null,
      area: ADM_AREA_OF[title] ?? "administrativo",
    });
  });

  const docDefs: [string, InstitutionalDocument["category"], number | null][] = [
    ["Contrato social consolidado", "contrato_social", null],
    ["Certidão negativa de débitos federais", "certidao", 12],
    ["Certidão FGTS", "certidao", -4],
    ["Alvará de funcionamento", "alvara", 140],
    ["Apólice de seguro de responsabilidade civil", "seguro", 45],
    ["Certidão negativa municipal", "certidao", 6],
  ];
  const institutionalDocuments: InstitutionalDocument[] = docDefs.map(([title, category, valid]) => ({
    ...base("doc", -100),
    title,
    category,
    fileId: addFile(null, `${title}.pdf`, "institucional", "application/pdf", -100),
    validUntil: valid === null ? null : d(valid),
  }));

  const vaultItems: VaultItem[] = [
    { ...base("vlt", -120), title: "Adobe Creative Cloud", url: "https://adobe.com", username: "design@draw.com.br", secret: "Cc!2026-draw", notes: "Licença equipe, 5 assentos", allowedRoles: ["admin", "gestao", "operacao"] },
    { ...base("vlt", -120), title: "Internet banking", url: "https://banco.example", username: "draw.pj", secret: "Bk#9182!x", notes: "Token físico com a Paula", allowedRoles: ["admin", "financeiro"] },
    { ...base("vlt", -120), title: "Registro.br (domínio)", url: "https://registro.br", username: "paula@draw.com.br", secret: "Reg@draw77", notes: null, allowedRoles: ["admin"] },
    { ...base("vlt", -120), title: "Instagram @draw", url: "https://instagram.com", username: "draw.legaldesign", secret: "Ig!draw2026", notes: "2FA no celular da Beatriz", allowedRoles: ["admin", "gestao", "comercial"] },
    { ...base("vlt", -120), title: "Emissor de NF da prefeitura", url: "https://nfe.prefeitura.example", username: "12345678", secret: "Nf$2026draw", notes: null, allowedRoles: ["admin", "financeiro"] },
  ];

  const resources: Resource[] = [
    { ...base("res", -150), title: "Figma — biblioteca Draw", url: "https://figma.com", category: "ferramenta", description: "Componentes e estilos oficiais." },
    { ...base("res", -150), title: "Template de memorial (12 páginas)", url: "https://figma.com", category: "template", description: "Grid, capas e quadros de precedentes." },
    { ...base("res", -150), title: "Playbook de kickoff com cliente", url: "https://notion.so", category: "playbook", description: "Roteiro de perguntas e checklist." },
    { ...base("res", -150), title: "Guia de linguagem simples", url: "https://plainlanguage.gov", category: "referencia", description: "Referência para roteiros." },
    { ...base("res", -150), title: "Template de proposta comercial", url: "https://docs.google.com", category: "template", description: "Modelo com escopo, prazo e condições." },
    { ...base("res", -150), title: "Playbook de onboarding de freelancers", url: "https://notion.so", category: "playbook", description: "Acessos, materiais e regras de NF." },
    { ...base("res", -150), title: "Unsplash", url: "https://unsplash.com", category: "ferramenta", description: "Banco de imagens gratuito." },
  ];

  /* ───────── Notificações ───────── */
  const notifDefs: [ID, NotificationType, string, string | null, number][] = [
    ["usr_paula", "aprovacao", "Proposta aprovada", "Proposta v1 aprovada pelo cliente.", -1],
    ["usr_paula", "nf_recebida", "NF recebida de freelancer", "NF anexada e aguardando conferência.", -2],
    ["usr_paula", "atraso", "Projeto atrasado", "O prazo do projeto venceu ontem.", -1],
    ["usr_paula", "mencao", "Beatriz mencionou você", "\"@Paula pode aprovar o orçamento?\"", 0],
    ["usr_beatriz", "prazo", "Prazo em 2 dias", "Tarefa \"Diagramar peça\" vence em 2 dias.", 0],
    ["usr_beatriz", "atribuicao", "Nova tarefa atribuída", "Você é responsável por \"Revisão final e checklist\".", -1],
    ["usr_lucas", "mencao", "Marina mencionou você", "\"@Lucas consegue revisar a diagramação até amanhã?\"", 0],
    ["usr_lucas", "atribuicao", "Nova tarefa atribuída", "\"Ilustrações e ícones\"", -2],
    ["usr_julia", "atribuicao", "Você foi alocada em um projeto", "Novo projeto de memorial jurídico.", -3],
    ["usr_julia", "nf_solicitada", "Envie sua nota fiscal", "Projeto concluído. Envie a NF pelo link.", -1],
    ["usr_fernanda", "nf_recebida", "NF divergente", "Valor da NF diferente do acordado.", -1],
    ["usr_carlos", "prazo", "Follow-up de proposta", "Proposta enviada há 7 dias sem resposta.", 0],
  ];
  notifDefs.forEach(([userId, type, title, body, off], i) => {
    const p = projects[(i * 5) % projects.length];
    notifications.push({
      ...base("ntf", off),
      createdAt: d(off, 9 + i),
      userId,
      type,
      projectId: p.id,
      entityType: "project",
      entityId: p.id,
      title,
      body: `${p.code} · ${body}`,
      readAt: i % 3 === 2 ? d(off) : null,
    });
  });

  const notificationPreferences: NotificationPreference[] = [];
  const nTypes: NotificationType[] = ["atribuicao", "mencao", "prazo", "atraso", "aprovacao", "nf_solicitada", "nf_recebida", "etapa", "projeto", "comentario", "cliente", "revisao"];
  for (const u of users) {
    for (const t of nTypes) {
      notificationPreferences.push({ ...base("npf", -200), userId: u.id, type: t, enabled: true });
    }
  }

  /* ───────── E-mail ───────── */
  const emailLogs: EmailLog[] = [];
  ["Convite para a plataforma", "Recuperação de senha", "Envie sua nota fiscal"].forEach((subject, i) => {
    emailLogs.push({
      ...base("eml", -i - 1),
      channel: "system",
      provider: i === 2 ? "resend" : "brevo",
      userId: null,
      projectId: null,
      to: [users[i + 4].email],
      cc: [],
      subject,
      template: ["convite", "recuperar_senha", "nf_freelancer", "resumo_diario"][i],
      status: "delivered",
      error: null,
      sentAt: d(-i - 1),
    });
  });

  const folders: Folder[] = [];
  ROOT_FOLDERS.forEach(([key, name, children], i) => {
    const root: Folder = { ...base("fld", -400), id: `fld_${key}`, parentId: null, name, systemKey: key, allowedRoles: key === "cerebro_paula" ? ["admin"] : key === "financeiro" ? ["admin", "gestao", "financeiro"] : [], order: i };
    folders.push(root);
    children.forEach((c, j) => folders.push({ ...base("fld", -390), id: key === "adm" && j === 0 ? FOLDER_ADM_DOCS : `fld_${key}_${j}`, parentId: root.id, name: c, systemKey: null, allowedRoles: [], order: j }));
  });

  return {
    version: SEED_VERSION,
    organizations: [
      {
        id: ORG,
        name: "Draw Legal Design",
        slug: "draw",
        settings: { freelancerPaymentDay: 20, dueSoonDays: 2, taxRatePct: 6 },
        createdAt: d(-400),
        updatedAt: d(-10),
        createdBy: null,
        deletedAt: null,
      },
    ],
    users,
    projectMembers,
    featureFlags: [
      { ...base("ff", -400), key: "portal_cliente", enabled: false },
      { ...base("ff", -400), key: "ambientes_juridicos", enabled: false },
      { ...base("ff", -400), key: "email_usuario", enabled: true },
      { ...base("ff", -400), key: "login_google", enabled: false },
    ],
    accessLogs: [],
    clientGroups,
    clients,
    clientContacts,
    freelancers,
    projectTypes,
    projectTypeTaskTemplates,
    projects,
    proposals,
    proposalInstallments,
    tasks,
    sprints,
    milestones,
    projectDeliverableMetrics,
    comments,
    approvals,
    files,
    folders,
    fileVersions,
    shareLinks,
    receivables,
    payables,
    freelancerInvoiceRequests,
    institutionalDocuments,
    vaultItems,
    vaultAccessLogs: [],
    resources,
    events,
    notifications,
    notificationPreferences,
    imports: [
      {
        ...base("imp", -15),
        kind: "clientes",
        sourceFileName: "clientes-monday.xlsx",
        status: "concluida",
        dryRun: false,
        report: { total: 22, ok: 20, errors: [{ line: 7, message: "CNPJ inválido: 11.111.111/1111-11" }, { line: 15, message: "CNPJ duplicado: já cadastrado como Nexo" }] },
      },
    ],
    emailLogs,
    systemMailSettings: [
      { ...base("sms", -60), transport: "brevo_resend", smtpHost: null, smtpPort: 587, smtpSecurity: "starttls", smtpUser: null, smtpPasswordSet: false, fromName: "Draw", fromAddress: "nao-responda@draw.com.br" },
    ],
    codeSequences,
  };
}
