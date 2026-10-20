import { Calculator, DollarSign, FileMinus, PiggyBank } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { materializeRecurringEntries } from "@/lib/finance/recurring/materialize";
import { materializeRecurringBills } from "@/lib/finance/bills/materialize";
import { getDashboardData } from "@/lib/finance/dashboardService";
import {
  PERIOD_OPTIONS,
  DEFAULT_PERIOD,
  COMPARISON_OPTIONS,
  DEFAULT_COMPARISON,
  parseCustomRangeParams,
  type PeriodKey,
  type ComparisonMode,
} from "@/lib/finance/period";
import { marginPointsDelta } from "@/lib/finance/calculations";
import { formatMoney } from "@/lib/money";
import { formatPercent, formatVariation, formatPercentagePoints, formatDateRange } from "@/lib/finance/format";
import { formatSignedGrowthText } from "@/lib/finance/insights";
import { MetricCard, type MetricVariation } from "@/components/dashboard/MetricCard";
import { FinancialChart } from "@/components/dashboard/FinancialChart";
import { TrendMiniChart } from "@/components/dashboard/TrendMiniChart";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import { TopCategoriesPanel } from "@/components/dashboard/TopCategoriesPanel";
import { ManagementSummaryPanel } from "@/components/dashboard/ManagementSummaryPanel";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { AssistantPanel } from "@/components/dashboard/AssistantPanel";
import { HealthBadge } from "@/components/financeiro/HealthBadge";
import { AlertsPanel } from "@/components/financeiro/AlertsPanel";
import { IndicatorsPanel, type IndicatorItem } from "@/components/financeiro/IndicatorsPanel";
import { CategoryBreakdownChart } from "@/components/financeiro/CategoryBreakdownChart";
import { BillsForecastPanel } from "@/components/dashboard/BillsForecastPanel";
import { CommercialPanel } from "@/components/dashboard/CommercialPanel";
import { InsightsSummaryPanel } from "@/components/dashboard/InsightsSummaryPanel";

const VALID_PERIODS = new Set<string>(PERIOD_OPTIONS.map((o) => o.value));
const VALID_COMPARISONS = new Set<string>(COMPARISON_OPTIONS.map((o) => o.value));

function directionFor(value: { isZero: () => boolean; isPositive: () => boolean } | null): "up" | "down" | "flat" {
  if (value === null || value.isZero()) return "flat";
  return value.isPositive() ? "up" : "down";
}

const COMPARISON_DESCRIPTIONS: Record<ComparisonMode, string> = {
  PREVIOUS_PERIOD: "vs período anterior",
  SAME_PERIOD_LAST_YEAR: "vs mesmo período do ano anterior",
  NONE: "",
};

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { user, business } = await requireOnboardedUser();
  // Materializacao preguicosa (Etapa 4.1): gera as ocorrencias de
  // recorrencias ativas ate agora antes de qualquer leitura financeira desta
  // pagina - nunca via cron/job em background.
  await materializeRecurringEntries(business.id, user.id);
  await materializeRecurringBills(business.id);
  const searchParams = await props.searchParams;

  const periodParam = typeof searchParams.period === "string" ? searchParams.period : undefined;
  const period: PeriodKey =
    periodParam && VALID_PERIODS.has(periodParam) ? (periodParam as PeriodKey) : DEFAULT_PERIOD;

  const comparisonParam = typeof searchParams.comparison === "string" ? searchParams.comparison : undefined;
  const comparison: ComparisonMode =
    comparisonParam && VALID_COMPARISONS.has(comparisonParam) ? (comparisonParam as ComparisonMode) : DEFAULT_COMPARISON;

  const startParam = typeof searchParams.start === "string" ? searchParams.start : null;
  const endParam = typeof searchParams.end === "string" ? searchParams.end : null;
  const customRange = period === "CUSTOM" ? parseCustomRangeParams(startParam, endParam) : undefined;
  const effectivePeriod: PeriodKey = period === "CUSTOM" && !customRange ? DEFAULT_PERIOD : period;
  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === effectivePeriod)?.label ?? "Este mês";

  const currency = business.currency ?? "BRL";
  const businessName = business.name ?? "Minha empresa";
  const lastUpdatedLabel = `hoje às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  const data = await getDashboardData(business.id, currency, periodLabel, {
    period: effectivePeriod,
    customRange,
    comparison,
  });

  const headerPeriodLabel = `${periodLabel} (${formatDateRange(data.range.start, data.range.end)})`;

  // Estado vazio REAL (secao 27): a empresa nunca lancou nada em nenhum
  // periodo - diferente de "este periodo especifico esta vazio", que os
  // MetricCards abaixo ja tratam individualmente com "Sem dados" (secao 28).
  if (!data.hasAnyEntriesEver) {
    return (
      <div className="flex flex-col gap-8">
        <DashboardHeader businessName={businessName} periodLabel={headerPeriodLabel} lastUpdatedLabel={lastUpdatedLabel} />
        <DashboardFilters />
        <DashboardEmptyState />
        <AssistantPanel />
      </div>
    );
  }

  const { summary, previousSummary } = data;
  const comparisonActive = comparison !== "NONE" && previousSummary !== null;
  const comparisonDescription = comparisonActive ? COMPARISON_DESCRIPTIONS[comparison] : undefined;

  const revenueVariation: MetricVariation | null = comparisonActive
    ? { text: formatVariation(data.revenueGrowth), direction: directionFor(data.revenueGrowth), description: comparisonDescription }
    : null;
  const costsVariation: MetricVariation | null = comparisonActive
    ? {
        text: formatVariation(data.costsGrowth),
        direction: directionFor(data.costsGrowth),
        description: comparisonDescription,
        favorableDirection: "down",
      }
    : null;
  const expensesVariation: MetricVariation | null = comparisonActive
    ? {
        text: formatVariation(data.expensesGrowth),
        direction: directionFor(data.expensesGrowth),
        description: comparisonDescription,
        favorableDirection: "down",
      }
    : null;
  const profitVariation: MetricVariation | null = comparisonActive
    ? {
        text: formatSignedGrowthText(data.profitGrowth, currency),
        direction:
          data.profitGrowth.kind === "percent"
            ? directionFor(data.profitGrowth.value)
            : data.profitGrowth.kind === "sign_flip"
              ? data.profitGrowth.fromNegative
                ? "up"
                : "down"
              : "flat",
        description: comparisonDescription,
      }
    : null;

  const netMarginDelta = previousSummary ? marginPointsDelta(summary.netMargin, previousSummary.netMargin) : null;
  const netMarginVariation: MetricVariation | null = comparisonActive
    ? { text: formatPercentagePoints(netMarginDelta), direction: directionFor(netMarginDelta), description: comparisonDescription }
    : null;

  const revenueDisplay = summary.hasRevenueEntries ? formatMoney(summary.revenue, currency) : null;
  const costsDisplay = summary.hasCostEntries ? formatMoney(summary.costs, currency) : null;
  const expensesDisplay = summary.hasExpenseEntries ? formatMoney(summary.expenses, currency) : null;
  const profitDisplay = summary.hasAnyEntries ? formatMoney(summary.netProfit, currency) : null;

  const breakEvenDisplay =
    data.breakEven.status === "ok" ? formatMoney(data.breakEven.breakEvenRevenue, currency) : data.breakEven.reason;
  const averageTicketDisplay =
    data.averageTicket.status === "ok" ? formatMoney(data.averageTicket.amount, currency) : "—";

  // So o que os MetricCards do topo NAO mostram - crescimento de faturamento/
  // lucro e as duas margens ja estao la, com o mesmo valor.
  const indicators: IndicatorItem[] = [
    { label: "Participação dos custos", value: formatPercent(data.costShare) },
    { label: "Participação das despesas", value: formatPercent(data.expenseShare) },
    { label: "Ticket médio", value: averageTicketDisplay },
    { label: "Ponto de equilíbrio", value: breakEvenDisplay },
  ];

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader businessName={businessName} periodLabel={headerPeriodLabel} lastUpdatedLabel={lastUpdatedLabel} />
      <DashboardFilters />

      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Faturamento"
          value={revenueDisplay}
          icon={<DollarSign size={16} strokeWidth={1.75} aria-hidden="true" />}
          tooltip="Total recebido ou faturado pela empresa no período."
          variation={revenueVariation}
        />
        <MetricCard
          label="Custos"
          value={costsDisplay}
          icon={<Calculator size={16} strokeWidth={1.75} aria-hidden="true" />}
          tooltip="Gastos diretamente relacionados à produção ou operação do produto/serviço."
          variation={costsVariation}
        />
        <MetricCard
          label="Despesas"
          value={expensesDisplay}
          icon={<FileMinus size={16} strokeWidth={1.75} aria-hidden="true" />}
          tooltip="Gastos necessários para manter a operação da empresa."
          variation={expensesVariation}
        />
        <MetricCard
          label="Lucro"
          value={profitDisplay}
          icon={<PiggyBank size={16} strokeWidth={1.75} aria-hidden="true" />}
          tooltip="Receita menos custos e despesas."
          variation={profitVariation}
        />
        <MetricCard
          label="Margem bruta"
          value={summary.hasAnyEntries ? formatPercent(summary.grossMargin) : null}
          tooltip="Percentual da receita que sobra depois de descontar apenas os custos."
        />
        <MetricCard
          label="Margem líquida"
          value={summary.hasAnyEntries ? formatPercent(summary.netMargin) : null}
          tooltip="Percentual da receita que sobra depois de descontar custos e despesas."
          variation={netMarginVariation}
        />
      </div>

      <FinancialChart title="Evolução financeira" series={data.evolutionSeries} currency={currency} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrendMiniChart
          title="Evolução do lucro"
          tooltip="Lucro líquido ao longo do período, para identificar se a empresa está melhorando ou piorando."
          points={data.profitTrend}
          comparePoints={comparisonActive ? data.compareProfitTrend : null}
          compareLabel={comparisonDescription}
          currency={currency}
        />
        <TrendMiniChart
          title="Faturamento"
          tooltip="Receita ao longo do período, para identificar crescimento, quedas e sazonalidade."
          points={data.revenueTrend}
          comparePoints={comparisonActive ? data.compareRevenueTrend : null}
          compareLabel={comparisonDescription}
          currency={currency}
        />
      </div>

      <TopCategoriesPanel ranking={data.topCategories} currency={currency} />

      <IndicatorsPanel items={indicators} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HealthBadge health={data.health} />
        <ManagementSummaryPanel text={data.summaryText} />
      </div>

      <AlertsPanel alerts={data.alerts} />

      <BillsForecastPanel bills={data.bills} currency={currency} />

      <CommercialPanel commercial={data.commercial} currency={currency} />

      <InsightsSummaryPanel insights={data.insights} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryBreakdownChart title="Distribuição de custos" entries={data.costBreakdown} currency={currency} />
        <CategoryBreakdownChart title="Distribuição de despesas" entries={data.expenseBreakdown} currency={currency} />
      </div>

      <AssistantPanel hasFinancialData />
    </div>
  );
}
