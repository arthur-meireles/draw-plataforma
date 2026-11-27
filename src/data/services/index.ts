/**
 * Ponto único da "API". Quando o back-end existir (ADR-001), cada função aqui passa a
 * chamar `/api/v1/...` mantendo a mesma assinatura — telas e hooks não mudam.
 */
export { ApiError } from "./_core";
export { projectsApi, type ProjectFilters, type ProjectListItem } from "./projects";
export { proposalsApi, type InstallmentInput } from "./proposals";
export { tasksApi, type TaskFilters, type TaskView } from "./tasks";
export { clientsApi, freelancersApi, projectTypesApi, type ClientInput, type FreelancerInput } from "./registry";
export { financeApi, publicInvoiceApi, type ReceivableFilters, type PayableFilters } from "./finance";
export { filesApi, commentsApi, approvalsApi, eventsApi, notificationsApi, type FileFilters } from "./collab";
export { authApi, usersApi, admApi, mailApi, importsApi, searchApi, peopleApi } from "./admin";
export { metricsApi, type MetricsFilter } from "./metrics";
export { driveApi, PROJECTS_ROOT, type DriveFolder, type DriveLocation } from "./drive";
export { financeExtraApi, publicInvoiceExtraApi, INVOICE_MAX_BYTES } from "./finance-extra";
export { commercialApi, freelancersExtraApi, type QuoteFilters, type QuoteItem } from "./cadastros-extra";
export { milestonesApi, deliverableMetricsApi, proposalsExtraApi, projectsExtraApi, type DeliverableMetrics } from "./prontuario-extra";
export { admExtraApi } from "./adm-extra";
export { payablesExtraApi, type CompletionDecision, type FreelancerPaymentInput, type ManualInvoiceInput } from "./payables-extra";
