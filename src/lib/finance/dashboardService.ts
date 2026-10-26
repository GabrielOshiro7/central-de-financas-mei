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
import { toEvolutionPoints, type EvolutionPoint } from "@/components/dashboard/evolutionPoints";
import type { TrendPoint } from "@/components/dashboard/TrendMiniChart";
import { getBillSummary, getForecastBalance, type BillSummary, type ForecastBalance } from "@/lib/finance/bills/queries";
import { getSalesSummary, getTopClients, type SalesSummary, type TopClientEntry } from "@/lib/sales/queries";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import type { InsightCardData } from "@/components/insights/InsightCard";
import type { BusinessClock } from "@/lib/time/zoned";

type Decimal = Prisma.Decimal;

export type BillDashboardIndicators = {
  payable: BillSummary;
  receivable: BillSummary;
  forecast: ForecastBalance;
};

// Etapa 6: secao comercial do dashboard, adicionada de forma aditiva (mesmo
// padrao de `bills` na Etapa 5) - nada do calculo financeiro existente muda
// de forma. `sales.averageTicket` (calculado em getSalesSummary a partir de
// Sale.total) e DELIBERADAMENTE um campo separado do `averageTicket`
// existente acima (baseado em FinancialEntry.revenue / null): misturar os
// dois seria comparar populacoes diferentes - nem toda receita do financeiro
// vem de uma Sale (lancamento manual, importacao), entao "faturamento total
// / numero de vendas cadastradas" seria um ticket medio artificialmente
// distorcido. O ticket medio COMERCIAL (so vendas) fica aqui; o ticket medio
// GERAL do negocio continua "N/D" ate existir uma nocao de "transacao" no
// financeiro como um todo.
export type CommercialDashboardIndicators = SalesSummary & { topClients: TopClientEntry[] };

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
  bills: BillDashboardIndicators;
  commercial: CommercialDashboardIndicators;
  insights: InsightCardData[];
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
  // Relogio da empresa (fuso + agora): periodos, series e insights sao
  // resolvidos no fuso dela (Etapa F3a); contas e vendas tambem (F3b).
  clock: BusinessClock
): Promise<DashboardData> {
  const { timeZone } = clock;
  const range = resolvePeriodRange(filters.period, clock, filters.customRange);
  const comparisonRange = resolveComparisonRange(filters.comparison, range);

  // A granularidade da serie temporal segue o alignment do periodo ATUAL,
  // tanto pra ele quanto pro periodo de comparacao (que nao tem alignment
  // proprio - resolveComparisonRange so retorna {start, end}) - um periodo
  // por dia nunca deve ser resumido em barras mensais (ver EvolutionPoint em
  // FinancialChart.tsx e o comentario de getDailySeriesForRange).
  const fetchSeries = (r: { start: Date; end: Date }) =>
    range.alignment === "day"
      ? getDailySeriesForRange(businessId, r, timeZone)
      : getMonthlySeriesForRange(businessId, r, timeZone);

  const [
    summary,
    series,
    costBreakdown,
    expenseBreakdown,
    hasAnyEntriesEver,
    previousSummaryRaw,
    comparisonSeriesRaw,
    payableSummary,
    receivableSummary,
    forecast,
    salesSummary,
    topClients,
    insights,
  ] = await Promise.all([
    getFinancialSummaryForRange(businessId, range),
    fetchSeries(range),
    getCategoryBreakdown(businessId, range, "COST"),
    getCategoryBreakdown(businessId, range, "EXPENSE"),
    hasAnyFinancialEntriesEver(businessId),
    comparisonRange ? getFinancialSummaryForRange(businessId, comparisonRange) : Promise.resolve(null),
    comparisonRange ? fetchSeries(comparisonRange) : Promise.resolve(null),
    // Indicadores de Contas a Pagar/Receber (Etapa 5) integrados ao
    // dashboard existente - reaproveita getBillSummary/getForecastBalance
    // (bills/queries.ts), nenhum calculo novo aqui. `range` so importa pro
    // "total pago/recebido no periodo"; vencido/hoje/proximos dias refletem
    // sempre o estado atual, independente do periodo selecionado.
    getBillSummary(businessId, "PAYABLE", range, clock),
    getBillSummary(businessId, "RECEIVABLE", range, clock),
    getForecastBalance(businessId, clock),
    // Secao comercial (Etapa 6) - reaproveita getSalesSummary/getTopClients
    // (sales/queries.ts) tal como estao, nenhum calculo novo aqui.
    getSalesSummary(businessId, range, clock),
    getTopClients(businessId, range, 5),
    // Insights (Etapa 7) - le o MESMO getInsightsForBusiness usado pela
    // pagina /insights, nunca chama IA (withAI so acontece atras do botao
    // manual de regenerar) - o dashboard nunca bloqueia por causa disso.
    // Independente de `range`/`comparison` (sempre reflete o mes corrente,
    // como o resto do modulo de insights). O .catch aqui e o que de fato
    // cumpre essa promessa: sem ele, qualquer falha ao gerar/ler insights
    // (ex.: um calculo inesperado) derrubava o Promise.all inteiro e levava
    // junto resumo/grafico/contas/vendas, que ja tinham carregado com
    // sucesso - um problema isolado dos insights nunca deveria custar o
    // resto do dashboard.
    getInsightsForBusiness(businessId, clock).catch((err) => {
      console.error("[dashboard] falha ao gerar/carregar insights, seguindo sem eles:", err);
      return [];
    }),
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
    bills: { payable: payableSummary, receivable: receivableSummary, forecast },
    commercial: { ...salesSummary, topClients },
    insights,
  };
}
