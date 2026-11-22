import type { financeApi } from "@/data/services";

export type ReceivableRow = Awaited<ReturnType<typeof financeApi.receivables>>[number];
export type PayableRow = Awaited<ReturnType<typeof financeApi.payables>>[number];
