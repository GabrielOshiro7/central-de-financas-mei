import { Prisma, type Currency } from "@prisma/client";
import type { FinancialSummary, CategoryBreakdownEntry } from "@/lib/finance/calculations";
import { calculateVariationPercent, marginPointsDelta } from "@/lib/finance/calculations";
import { formatMoney } from "@/lib/money";
import { formatPercent } from "@/lib/finance/format";

type Decimal = Prisma.Decimal;

// Limiares nomeados (secao 20/21 do prompt da Etapa 3) - ajustaveis aqui, sem
// numeros soltos espalhados pela logica de alertas/saude financeira.
export const EXPENSE_INCREASE_ALERT_THRESHOLD_PERCENT = 10;
export const PROFIT_DROP_ALERT_THRESHOLD_PERCENT = 10;
export const MARGIN_DROP_THRESHOLD_POINTS = 3;
export const CATEGORY_SHARE_ALERT_THRESHOLD_PERCENT = 40;
export const HEALTHY_MARGIN_THRESHOLD_PERCENT = 10;

export type FinancialAlert = { id: string; message: string };

// Todas as comparacoes exigem um periodo anterior com dado (previous !==
// null) - sem isso, nao ha o que comparar, entao esses alertas simplesmente
// nao disparam (nunca comparamos contra zero "por padrao").
export function generateAlerts(
  current: FinancialSummary,
  previous: FinancialSummary | null,
  expenseBreakdown: CategoryBreakdownEntry[]
): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];

  if (previous) {
    const expensesVariation = calculateVariationPercent(current.expenses, previous.expenses);
    if (expensesVariation !== null && expensesVariation.gte(EXPENSE_INCREASE_ALERT_THRESHOLD_PERCENT)) {
      alerts.push({
        id: "expenses_increase",
        message: `Suas despesas aumentaram ${formatPercent(expensesVariation)} em relação ao período anterior.`,
      });
    }

    const costsVariation = calculateVariationPercent(current.costs, previous.costs);
    const revenueVariation = calculateVariationPercent(current.revenue, previous.revenue);
    if (costsVariation !== null && revenueVariation !== null && costsVariation.gt(revenueVariation)) {
      alerts.push({
        id: "costs_outpacing_revenue",
        message: `Seus custos cresceram mais rápido (${formatPercent(costsVariation)}) do que o faturamento (${formatPercent(revenueVariation)}) no período.`,
      });
    }

    const marginDrop = marginPointsDelta(previous.netMargin, current.netMargin);
    if (marginDrop !== null && marginDrop.gte(MARGIN_DROP_THRESHOLD_POINTS)) {
      alerts.push({
        id: "margin_drop",
        message: `Sua margem líquida caiu de ${formatPercent(previous.netMargin)} para ${formatPercent(current.netMargin)}.`,
      });
    }

    // So compara queda percentual de lucro quando o periodo anterior teve
    // lucro positivo - a partir de uma base zero ou negativa, "queda de X%"
    // nao tem um significado claro.
    if (previous.netProfit.isPositive()) {
      const profitVariation = calculateVariationPercent(current.netProfit, previous.netProfit);
      if (profitVariation !== null && profitVariation.lte(-PROFIT_DROP_ALERT_THRESHOLD_PERCENT)) {
        alerts.push({
          id: "profit_drop",
          message: `Seu lucro caiu ${formatPercent(profitVariation.abs())} em relação ao período anterior.`,
        });
      }
    }
  }

  const topExpenseCategory = expenseBreakdown[0];
  if (
    topExpenseCategory?.percentage !== null &&
    topExpenseCategory?.percentage !== undefined &&
    topExpenseCategory.percentage.gte(CATEGORY_SHARE_ALERT_THRESHOLD_PERCENT)
  ) {
    alerts.push({
      id: "concentrated_expense_category",
      message: `A categoria "${topExpenseCategory.categoryName}" representa ${formatPercent(topExpenseCategory.percentage)} do total de despesas do período.`,
    });
  }

  return alerts;
}

export type FinancialHealth = "GOOD" | "WARNING" | "CRITICAL" | "NO_DATA";

// So um indicador interno e simplificado (nao e uma analise contabil formal) -
// ver nota na secao 21 do prompt. A ordem de avaliacao importa: critico >
// atencao > bom.
export function computeFinancialHealth(
  current: FinancialSummary,
  previous: FinancialSummary | null
): FinancialHealth {
  if (!current.hasAnyEntries) return "NO_DATA";

  const isCritical =
    current.netProfit.isNegative() || (current.netMargin !== null && current.netMargin.isNegative());
  if (isCritical) return "CRITICAL";

  const marginDrop = previous ? marginPointsDelta(previous.netMargin, current.netMargin) : null;
  const droppedSignificantly = marginDrop !== null && marginDrop.gte(MARGIN_DROP_THRESHOLD_POINTS);

  const marginBelowHealthy =
    current.netMargin !== null && current.netMargin.lt(HEALTHY_MARGIN_THRESHOLD_PERCENT);

  if (droppedSignificantly || marginBelowHealthy) return "WARNING";

  if (current.netMargin !== null && current.netMargin.gte(HEALTHY_MARGIN_THRESHOLD_PERCENT) && current.netProfit.isPositive()) {
    return "GOOD";
  }

  return "WARNING";
}

export const HEALTH_LABELS: Record<FinancialHealth, string> = {
  GOOD: "Boa",
  WARNING: "Atenção",
  CRITICAL: "Crítica",
  NO_DATA: "Sem dados suficientes",
};

export const HEALTH_ICONS: Record<FinancialHealth, string> = {
  GOOD: "🟢",
  WARNING: "🟡",
  CRITICAL: "🔴",
  NO_DATA: "⚪",
};

function shareText(part: Decimal, total: Decimal): string {
  if (total.isZero()) return "N/A";
  return formatPercent(part.dividedBy(total).times(100));
}

// Texto gerado por regras do sistema (nao IA - ver secao 22/29). A camada
// futura de IA podera ler os mesmos FinancialSummary/alertas e substituir ou
// expandir este texto.
export function generateSummaryText(params: {
  periodLabel: string;
  currency: Currency;
  summary: FinancialSummary;
}): string {
  const { periodLabel, currency, summary } = params;

  if (!summary.hasAnyEntries) {
    return `Nenhum lançamento registrado em "${periodLabel}" ainda.`;
  }

  const sentences: string[] = [];

  if (summary.hasRevenueEntries) {
    sentences.push(`Em "${periodLabel}" sua empresa faturou ${formatMoney(summary.revenue, currency)}.`);
  } else {
    sentences.push(`Em "${periodLabel}" sua empresa não registrou faturamento.`);
  }

  if (summary.hasCostEntries) {
    sentences.push(
      `Os custos somaram ${formatMoney(summary.costs, currency)}${
        summary.hasRevenueEntries ? ` (${shareText(summary.costs, summary.revenue)} do faturamento)` : ""
      }.`
    );
  }

  if (summary.hasExpenseEntries) {
    sentences.push(
      `As despesas somaram ${formatMoney(summary.expenses, currency)}${
        summary.hasRevenueEntries ? ` (${shareText(summary.expenses, summary.revenue)} do faturamento)` : ""
      }.`
    );
  }

  sentences.push(`O lucro líquido foi de ${formatMoney(summary.netProfit, currency)}.`);
  sentences.push(`A margem líquida foi de ${formatPercent(summary.netMargin)}.`);

  return sentences.join(" ");
}
