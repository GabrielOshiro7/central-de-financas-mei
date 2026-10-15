import type { Currency } from "@prisma/client";
import type { FinancialSummary, CategoryBreakdownEntry, SignedGrowth } from "@/lib/finance/calculations";
import { calculateVariationPercent, marginPointsDelta } from "@/lib/finance/calculations";
import { formatMoney } from "@/lib/money";
import { formatPercent, formatVariation } from "@/lib/finance/format";

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

// Cor do "farolzinho" de saude financeira em HealthBadge (renderizado como
// <Circle fill="currentColor">) - reaproveita exatamente os mesmos hexes
// Musgo/Âmbar/Terracota ja usados nos selos de status de pagamento/prioridade
// de insight (ver PRIORITY_BADGE_STYLE em InsightCard.tsx), em vez de uma
// familia de cor nova, ja que este e conceitualmente o mesmo trio
// positivo/atencao/critico.
export const HEALTH_ICON_COLOR: Record<FinancialHealth, string> = {
  GOOD: "text-[#3f6b4a] dark:text-[#8FD4A0]",
  WARNING: "text-[#8a570c] dark:text-[#F0B24A]",
  CRITICAL: "text-[#a8402a] dark:text-[#F0917C]",
  NO_DATA: "text-gray-300 dark:text-neutral-700",
};

// Texto gerado por regras do sistema (nao IA - ver secao 22/29). A camada
// futura de IA podera ler os mesmos FinancialSummary/alertas e substituir ou
// expandir este texto. E uma leitura QUALITATIVA do periodo (fechou no lucro
// ou no prejuizo, o que pesou mais) - de proposito nao repete nenhum valor:
// faturamento, custos, despesas, lucro e margens ja estao nos cards da mesma
// tela.
export function generateSummaryText(params: {
  periodLabel: string;
  currency: Currency;
  summary: FinancialSummary;
}): string {
  const { periodLabel, summary } = params;

  if (!summary.hasAnyEntries) {
    return `Nenhum lançamento registrado em "${periodLabel}" ainda.`;
  }

  const sentences: string[] = [];

  if (!summary.hasRevenueEntries) {
    sentences.push(`Em "${periodLabel}" sua empresa não registrou faturamento, só gastos.`);
  } else if (summary.netProfit.isZero()) {
    sentences.push(
      `Em "${periodLabel}" sua empresa fechou no zero a zero: o faturamento foi igual à soma de custos e despesas.`
    );
  } else if (summary.netProfit.isPositive()) {
    sentences.push(`Em "${periodLabel}" sua empresa fechou no lucro: o faturamento cobriu todos os custos e despesas.`);
  } else {
    sentences.push(
      `Em "${periodLabel}" sua empresa fechou no prejuízo: custos e despesas somados passaram do faturamento.`
    );
  }

  if (summary.hasRevenueEntries && summary.costs.greaterThan(summary.revenue)) {
    sentences.push("Só os custos já passaram do faturamento, antes mesmo das despesas.");
  }

  if (summary.hasCostEntries && summary.hasExpenseEntries) {
    if (summary.costs.greaterThan(summary.expenses)) {
      sentences.push("Os custos pesaram mais que as despesas.");
    } else if (summary.expenses.greaterThan(summary.costs)) {
      sentences.push("As despesas pesaram mais que os custos.");
    } else {
      sentences.push("Custos e despesas pesaram igual.");
    }
  } else if (summary.hasCostEntries) {
    sentences.push("Todo o gasto veio de custos; não há despesas lançadas.");
  } else if (summary.hasExpenseEntries) {
    sentences.push("Todo o gasto veio de despesas; não há custos lançados.");
  } else {
    sentences.push("Não há custos nem despesas lançados.");
  }

  return sentences.join(" ");
}

// Texto de exibicao para SignedGrowth (calculations.ts) - so essa funcao
// conhece moeda/formatacao; describeSignedGrowth em si e Decimal puro. No
// caso de troca de sinal (ADENDO da Etapa 4), soletra a transicao em valor
// absoluto em vez de uma porcentagem enganosa.
export function formatSignedGrowthText(growth: SignedGrowth, currency: Currency): string {
  switch (growth.kind) {
    case "no_base":
      return "Sem base de comparação";
    case "percent":
      return formatVariation(growth.value);
    case "sign_flip":
      return growth.fromNegative
        ? `Saiu de prejuízo de ${formatMoney(growth.previous.abs(), currency)} para lucro de ${formatMoney(growth.current, currency)}`
        : `Saiu de lucro de ${formatMoney(growth.previous, currency)} para prejuízo de ${formatMoney(growth.current.abs(), currency)}`;
    default: {
      const exhaustiveCheck: never = growth;
      throw new Error(`SignedGrowth não tratado: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
}
