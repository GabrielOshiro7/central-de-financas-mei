import { requireOnboardedUser } from "@/lib/auth/guards";
import { getFinancialSummary, getMonthlySeries } from "@/lib/finance/queries";
import { DEFAULT_PERIOD, PERIOD_OPTIONS, type PeriodKey } from "@/lib/finance/period";
import { formatMoney } from "@/lib/money";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { FinancialChart } from "@/components/dashboard/FinancialChart";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";

const VALID_PERIODS = new Set<string>(PERIOD_OPTIONS.map((o) => o.value));

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { user, business } = await requireOnboardedUser();
  const searchParams = await props.searchParams;
  const periodParam = searchParams.period;
  const period: PeriodKey =
    typeof periodParam === "string" && VALID_PERIODS.has(periodParam)
      ? (periodParam as PeriodKey)
      : DEFAULT_PERIOD;

  const currency = business.currency ?? "BRL";
  const [summary, series] = await Promise.all([
    getFinancialSummary(business.id, period),
    getMonthlySeries(business.id, period),
  ]);

  const revenueDisplay = summary.hasRevenueEntries ? formatMoney(summary.revenue, currency) : null;
  const costsDisplay = summary.hasCostEntries ? formatMoney(summary.costs, currency) : null;
  const expensesDisplay = summary.hasExpenseEntries ? formatMoney(summary.expenses, currency) : null;
  const profitDisplay = summary.hasAnyEntries ? formatMoney(summary.netProfit, currency) : null;
  const marginDisplay = !summary.hasAnyEntries
    ? null
    : summary.netMargin === null
      ? "N/A"
      : `${summary.netMargin.toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Olá, {user.name}</h1>
          <p className="text-sm text-gray-500 dark:text-neutral-400">{business.name}</p>
        </div>
        <PeriodSelector value={period} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Faturamento" value={revenueDisplay} />
        <MetricCard label="Custos" value={costsDisplay} />
        <MetricCard label="Despesas" value={expensesDisplay} />
        <MetricCard label="Lucro" value={profitDisplay} />
        <MetricCard label="Margem" value={marginDisplay} />
      </div>

      <FinancialChart series={series} />

      <AssistantPanel />
    </div>
  );
}
