import type { InsightCategory, InsightPriority } from "@prisma/client";

export const INSIGHT_CATEGORY_OPTIONS: { value: InsightCategory; label: string }[] = [
  { value: "PERFORMANCE", label: "Desempenho" },
  { value: "PROFITABILITY", label: "Rentabilidade" },
  { value: "CASH_FLOW", label: "Fluxo de caixa" },
  { value: "CLIENTS", label: "Clientes" },
  { value: "SALES", label: "Vendas" },
  { value: "RECEIVABLES", label: "Contas a receber" },
];

export const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = Object.fromEntries(
  INSIGHT_CATEGORY_OPTIONS.map((o) => [o.value, o.label])
) as Record<InsightCategory, string>;

export const INSIGHT_PRIORITY_OPTIONS: { value: InsightPriority; label: string }[] = [
  { value: "CRITICAL", label: "Crítico" },
  { value: "ATTENTION", label: "Atenção" },
  { value: "INFO", label: "Informativo" },
];

export const INSIGHT_PRIORITY_LABELS: Record<InsightPriority, string> = Object.fromEntries(
  INSIGHT_PRIORITY_OPTIONS.map((o) => [o.value, o.label])
) as Record<InsightPriority, string>;
