import { Prisma, type Currency } from "@prisma/client";
import {
  getFinancialSummaryForRange,
  getMonthlySeriesForRange,
  getDailySeriesForRange,
  getCategoryBreakdown,
  hasAnyFinancialEntriesEver,
  type MonthlyPoint,
  type DailyPoint,
} from "@/lib/finance/queries";
import {
  resolvePeriodRange,
  resolveComparisonRange,
  type PeriodKey,
  type ComparisonMode,
  type CustomRange,
} from "@/lib/finance/period";
import {
  calculateVariationPercent,
  describeSignedGrowth,
  calculateBreakEven,
  calculateAverageTicket,
  buildTopCategoriesRanking,
  type FinancialSummary,
  type CategoryBreakdownEntry,
  type SignedGrowth,
  type BreakEvenResult,
  type AverageTicketResult,
  type TopCategoriesRanking,
} from "@/lib/finance/calculations";
import {
  generateAlerts,
  computeFinancialHealth,
  generateSummaryText,
  type FinancialAlert,
  type FinancialHealth,
} from "@/lib/finance/insights";
import { toEvolutionPoints, type EvolutionPoint } from "@/components/dashboard/FinancialChart";
import type { TrendPoint } from "@/components/dashboard/TrendMiniChart";

type Decimal = Prisma.Decimal;

export type DashboardFilters = {
  period: PeriodKey;
  customRange?: CustomRange;
  comparison: ComparisonMode;
};

export type DashboardData = {
  range: { start: Date; end: Date };
  comparisonRange: { start: Date; end: Date } | null;
  summary: FinancialSummary;
  previousSummary: FinancialSummary | null;
  // receita/custos/despesas sao sempre >= 0 (soma de lancamentos), entao
  // calculateVariationPercent (sem tratamento de troca de sinal) e correto
  // aqui. Lucro pode ser negativo - ver profitGrowth abaixo.
  revenueGrowth: Decimal | null;
  costsGrowth: Decimal | null;
  expensesGrowth: Decimal | null;
  profitGrowth: SignedGrowth;
  costShare: Decimal | null; // custos / receita * 100
  expenseShare: Decimal | null; // despesas / receita * 100
  breakEven: BreakEvenResult;
  averageTicket: AverageTicketResult;
  costBreakdown: CategoryBreakdownEntry[];
  expenseBreakdown: CategoryBreakdownEntry[];
  topCategories: TopCategoriesRanking;
  evolutionSeries: EvolutionPoint[];
  revenueTrend: TrendPoint[];
  profitTrend: TrendPoint[];
  compareRevenueTrend: TrendPoint[] | null;
  compareProfitTrend: TrendPoint[] | null;
  alerts: FinancialAlert[];
  health: FinancialHealth;
  summaryText: string;
  hasAnyEntriesEver: boolean;
};

function toTrendPoints(points: (MonthlyPoint | DailyPoint)[], key: "revenue" | "netProfit"): TrendPoint[] {
  return points.map((p) => ({ label: p.label, value: p[key].toNumber() }));
}

// Camada de servico do dashboard (secao 43 da Etapa 4): busca os dados,
// agrega, calcula os indicadores e monta um unico objeto tipado para a
// pagina consumir - nenhuma regra financeira fica no componente visual.
// Reaproveita integralmente os servicos/calculos ja existentes da Etapa 3
// (getFinancialSummaryForRange, generateAlerts, computeFinancialHealth,
// generateSummaryText) - nada e recalculado em paralelo/duplicado.
export async function getDashboardData(
  businessId: string,
  currency: Currency,
  periodLabel: string,
  filters: DashboardFilters,
  now: Date = new Date()
): Promise<DashboardData> {
  const range = resolvePeriodRange(filters.period, now, filters.customRange);
  const comparisonRange = resolveComparisonRange(filters.comparison, range);

  // A granularidade da serie temporal segue o alignment do periodo ATUAL,
  // tanto pra ele quanto pro periodo de comparacao (que nao tem alignment
  // proprio - resolveComparisonRange so retorna {start, end}) - um periodo
  // por dia nunca deve ser resumido em barras mensais (ver EvolutionPoint em
  // FinancialChart.tsx e o comentario de getDailySeriesForRange).
  const fetchSeries = (r: { start: Date; end: Date }) =>
    range.alignment === "day" ? getDailySeriesForRange(businessId, r) : getMonthlySeriesForRange(businessId, r);

  const [summary, series, costBreakdown, expenseBreakdown, hasAnyEntriesEver, previousSummaryRaw, comparisonSeriesRaw] =
    await Promise.all([
      getFinancialSummaryForRange(businessId, range),
      fetchSeries(range),
      getCategoryBreakdown(businessId, range, "COST"),
      getCategoryBreakdown(businessId, range, "EXPENSE"),
      hasAnyFinancialEntriesEver(businessId),
      comparisonRange ? getFinancialSummaryForRange(businessId, comparisonRange) : Promise.resolve(null),
      comparisonRange ? fetchSeries(comparisonRange) : Promise.resolve(null),
    ]);

  // So comparamos contra o periodo de comparacao se ele de fato teve dado -
  // "sem dados suficientes" vira null (N/A) em vez de comparar contra zero.
  const previousSummary = previousSummaryRaw && previousSummaryRaw.hasAnyEntries ? previousSummaryRaw : null;

  const revenueGrowth = previousSummary ? calculateVariationPercent(summary.revenue, previousSummary.revenue) : null;
  const costsGrowth = previousSummary ? calculateVariationPercent(summary.costs, previousSummary.costs) : null;
  const expensesGrowth = previousSummary
    ? calculateVariationPercent(summary.expenses, previousSummary.expenses)
    : null;
  const profitGrowth: SignedGrowth = previousSummary
    ? describeSignedGrowth(summary.netProfit, previousSummary.netProfit)
    : { kind: "no_base" };

  const costShare = summary.revenue.isZero() ? null : summary.costs.dividedBy(summary.revenue).times(100);
  const expenseShare = summary.revenue.isZero() ? null : summary.expenses.dividedBy(summary.revenue).times(100);

  const breakEven = calculateBreakEven(summary);
  // Nao ha contagem de vendas em FinancialEntry nem na importacao (Etapa 4,
  // secao 20/28) - sempre "N/D" hoje.
  const averageTicket = calculateAverageTicket(summary.revenue, null);

  const topCategories = buildTopCategoriesRanking(
    [...costBreakdown, ...expenseBreakdown].map((e) => ({
      categoryId: e.categoryId,
      categoryName: e.categoryName,
      amount: e.amount,
    }))
  );

  const alerts = generateAlerts(summary, previousSummary, expenseBreakdown);
  const health = computeFinancialHealth(summary, previousSummary);
  const summaryText = generateSummaryText({ periodLabel, currency, summary });

  return {
    range,
    comparisonRange,
    summary,
    previousSummary,
    revenueGrowth,
    costsGrowth,
    expensesGrowth,
    profitGrowth,
    costShare,
    expenseShare,
    breakEven,
    averageTicket,
    costBreakdown,
    expenseBreakdown,
    topCategories,
    evolutionSeries: toEvolutionPoints(series),
    revenueTrend: toTrendPoints(series, "revenue"),
    profitTrend: toTrendPoints(series, "netProfit"),
    compareRevenueTrend: comparisonSeriesRaw ? toTrendPoints(comparisonSeriesRaw, "revenue") : null,
    compareProfitTrend: comparisonSeriesRaw ? toTrendPoints(comparisonSeriesRaw, "netProfit") : null,
    alerts,
    health,
    summaryText,
    hasAnyEntriesEver,
  };
}
