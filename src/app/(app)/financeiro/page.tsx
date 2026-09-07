import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  getFinancialSummaryForRange,
  getCategoryBreakdown,
  getMonthlySeries,
} from "@/lib/finance/queries";
import {
  resolvePeriodRange,
  getPreviousPeriodRange,
  parseCustomRangeParams,
  PERIOD_OPTIONS,
  DEFAULT_PERIOD,
  type PeriodKey,
} from "@/lib/finance/period";
import { calculateVariationPercent } from "@/lib/finance/calculations";
import { formatMoney } from "@/lib/money";
import { formatPercent, formatVariation } from "@/lib/finance/format";
import { generateAlerts, computeFinancialHealth, generateSummaryText } from "@/lib/finance/insights";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { FinancialChart } from "@/components/dashboard/FinancialChart";
import { FinanceiroPeriodSelector } from "@/components/financeiro/FinanceiroPeriodSelector";
import { HealthBadge } from "@/components/financeiro/HealthBadge";
import { AlertsPanel } from "@/components/financeiro/AlertsPanel";
import { IndicatorsPanel, type IndicatorItem } from "@/components/financeiro/IndicatorsPanel";
import { CategoryBreakdownChart } from "@/components/financeiro/CategoryBreakdownChart";

const VALID_PERIODS = new Set<string>(PERIOD_OPTIONS.map((o) => o.value));

export default async function FinanceiroVisaoGeralPage(props: PageProps<"/financeiro">) {
  const { business } = await requireOnboardedUser();
  const searchParams = await props.searchParams;

  const periodParam = typeof searchParams.period === "string" ? searchParams.period : undefined;
  const period: PeriodKey =
    periodParam && VALID_PERIODS.has(periodParam) ? (periodParam as PeriodKey) : DEFAULT_PERIOD;

  const startParam = typeof searchParams.start === "string" ? searchParams.start : null;
  const endParam = typeof searchParams.end === "string" ? searchParams.end : null;
  const customRange = period === "CUSTOM" ? parseCustomRangeParams(startParam, endParam) : undefined;
  const effectivePeriod: PeriodKey = period === "CUSTOM" && !customRange ? DEFAULT_PERIOD : period;
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === effectivePeriod)?.label ?? "Este mês";

  const now = new Date();
  const range = resolvePeriodRange(effectivePeriod, now, customRange);
  const previousRange = getPreviousPeriodRange(range);
  const currency = business.currency ?? "BRL";

  const [summary, previousSummary, costBreakdown, expenseBreakdown, series] = await Promise.all([
    getFinancialSummaryForRange(business.id, range),
    getFinancialSummaryForRange(business.id, previousRange),
    getCategoryBreakdown(business.id, range, "COST"),
    getCategoryBreakdown(business.id, range, "EXPENSE"),
    getMonthlySeries(business.id, effectivePeriod, now, customRange),
  ]);

  // So comparamos contra o periodo anterior se ele de fato tiver dado -
  // "sem dados suficientes" vira N/A em vez de comparar contra zero (secao 16).
  const previousForComparison = previousSummary.hasAnyEntries ? previousSummary : null;

  const alerts = generateAlerts(summary, previousForComparison, expenseBreakdown);
  const health = computeFinancialHealth(summary, previousForComparison);
  const summaryText = generateSummaryText({ periodLabel, currency, summary });

  const revenueDisplay = summary.hasRevenueEntries ? formatMoney(summary.revenue, currency) : null;
  const costsDisplay = summary.hasCostEntries ? formatMoney(summary.costs, currency) : null;
  const expensesDisplay = summary.hasExpenseEntries ? formatMoney(summary.expenses, currency) : null;
  const profitDisplay = summary.hasAnyEntries ? formatMoney(summary.netProfit, currency) : null;
  const marginDisplay = summary.hasAnyEntries ? formatPercent(summary.netMargin) : null;

  const indicators: IndicatorItem[] = [
    {
      label: "Crescimento do faturamento",
      value: previousForComparison
        ? formatVariation(calculateVariationPercent(summary.revenue, previousForComparison.revenue))
        : "N/A",
    },
    {
      label: "Variação dos custos",
      value: previousForComparison
        ? formatVariation(calculateVariationPercent(summary.costs, previousForComparison.costs))
        : "N/A",
    },
    {
      label: "Variação das despesas",
      value: previousForComparison
        ? formatVariation(calculateVariationPercent(summary.expenses, previousForComparison.expenses))
        : "N/A",
    },
    {
      label: "Variação do lucro",
      value: previousForComparison
        ? formatVariation(calculateVariationPercent(summary.netProfit, previousForComparison.netProfit))
        : "N/A",
    },
    { label: "Margem bruta", value: formatPercent(summary.grossMargin) },
    { label: "Margem líquida", value: formatPercent(summary.netMargin) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Visão geral</h1>
        <FinanceiroPeriodSelector />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Faturamento" value={revenueDisplay} />
        <MetricCard label="Custos" value={costsDisplay} />
        <MetricCard label="Despesas" value={expensesDisplay} />
        <MetricCard label="Lucro" value={profitDisplay} />
        <MetricCard label="Margem bruta" value={summary.hasAnyEntries ? formatPercent(summary.grossMargin) : null} />
        <MetricCard label="Margem líquida" value={marginDisplay} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HealthBadge health={health} />
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-xs text-gray-500 dark:text-neutral-400">Resumo do período</div>
          <p className="mt-1 text-sm text-gray-700 dark:text-neutral-300">{summaryText}</p>
        </div>
      </div>

      <IndicatorsPanel items={indicators} />

      <AlertsPanel alerts={alerts} />

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-neutral-100">Evolução financeira</h2>
        <FinancialChart series={series} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryBreakdownChart title="Distribuição de custos" entries={costBreakdown} currency={currency} />
        <CategoryBreakdownChart title="Distribuição de despesas" entries={expenseBreakdown} currency={currency} />
      </div>
    </div>
  );
}
