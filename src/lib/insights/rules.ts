import { Prisma, type InsightCategory, type InsightMetric, type InsightPriority, type VariationKind } from "@prisma/client";
import { calculateVariationPercent, marginPointsDelta } from "@/lib/finance/calculations";
import { formatMoney } from "@/lib/money";
import { formatPercent, formatPercentagePoints, formatVariation } from "@/lib/finance/format";
import { isVariationRelevant } from "@/lib/insights/calculations";
import type { IndicatorSnapshot } from "@/lib/insights/snapshot";
import {
  REVENUE_GROWTH_RELEVANT_PCT,
  MARGIN_DROP_RELEVANT_PP,
  EXPENSE_GROWTH_RELEVANT_PCT,
  TICKET_CHANGE_RELEVANT_PCT,
  OVERDUE_INCREASE_RELEVANT_PCT,
  MIN_CLIENTS_FOR_CONCENTRATION_INSIGHT,
  CONCENTRATION_RELEVANT_SHARE_PCT,
  INACTIVITY_MIN_PREVIOUS_SHARE_PCT,
} from "@/lib/insights/thresholds";

type Decimal = Prisma.Decimal;

// O que cada funcao evaluate* produz: um insight JA completo e correto
// (title/description/recommendation em portugues, prontos para renderizar) -
// so falta o carimbo de narrativeSource, aplicado uma unica vez em
// evaluateSnapshot (nunca repetido em cada funcao).
type RawInsightDraft = {
  category: InsightCategory;
  metric: InsightMetric;
  priority: InsightPriority;
  title: string;
  description: string;
  recommendation: string | null;
  currentValue: Decimal | null;
  previousValue: Decimal | null;
  variationAbsolute: Decimal | null;
  variationPercent: Decimal | null;
  variationKind: VariationKind | null;
  source: string;
};

// Isto e o que e persistido por padrao (narrativeSource "template") e o que
// narrative.ts usa como base/verdade para validar uma eventual reescrita por
// IA - nunca o contrario.
export type InsightDraft = RawInsightDraft & { narrativeSource: "template" | "ai" };

// Severidade simples por magnitude: o dobro do limiar de relevancia vira
// CRITICAL, o resto que passou no limiar vira ATTENTION. Mesma constante
// nomeada usada para decidir "e relevante o suficiente pra virar insight" -
// nenhum numero magico novo aqui.
function severityFromMagnitude(valueAbs: Decimal, thresholdAbs: number, badDirection: boolean): InsightPriority {
  if (!badDirection) return "INFO";
  return valueAbs.greaterThanOrEqualTo(thresholdAbs * 2) ? "CRITICAL" : "ATTENTION";
}

function evaluateRevenueGrowth(snapshot: IndicatorSnapshot): RawInsightDraft | null {
  if (!snapshot.hasPreviousPeriod) return null;
  const variation = calculateVariationPercent(snapshot.revenue.current, snapshot.revenue.previous);
  if (!isVariationRelevant(variation, REVENUE_GROWTH_RELEVANT_PCT)) return null;

  const grew = variation!.greaterThan(0);
  const currentFmt = formatMoney(snapshot.revenue.current, snapshot.currency);
  const previousFmt = formatMoney(snapshot.revenue.previous, snapshot.currency);
  const variationFmt = formatVariation(variation);

  return {
    category: "PERFORMANCE",
    metric: "REVENUE_GROWTH",
    priority: severityFromMagnitude(variation!.abs(), REVENUE_GROWTH_RELEVANT_PCT, !grew),
    title: grew ? "Faturamento em crescimento" : "Faturamento em queda",
    description: `O faturamento de ${snapshot.periodLabel} foi ${currentFmt}, uma variação de ${variationFmt} em relação a ${previousFmt} no período anterior.`,
    recommendation: grew
      ? null
      : "Revise o que mudou nas vendas deste período (menos clientes, tickets menores ou sazonalidade) antes de cortar custos.",
    currentValue: snapshot.revenue.current,
    previousValue: snapshot.revenue.previous,
    variationAbsolute: snapshot.revenue.current.minus(snapshot.revenue.previous),
    variationPercent: variation,
    variationKind: "PERCENT",
    source: "financeiro",
  };
}

function evaluateMarginChange(snapshot: IndicatorSnapshot): RawInsightDraft | null {
  if (!snapshot.hasPreviousPeriod) return null;
  const delta = marginPointsDelta(snapshot.margin.current, snapshot.margin.previous);
  if (!isVariationRelevant(delta, MARGIN_DROP_RELEVANT_PP)) return null;

  const improved = delta!.greaterThan(0);
  const currentFmt = formatPercent(snapshot.margin.current);
  const previousFmt = formatPercent(snapshot.margin.previous);
  const deltaFmt = formatPercentagePoints(delta);

  return {
    category: "PROFITABILITY",
    metric: "MARGIN_CHANGE",
    priority: severityFromMagnitude(delta!.abs(), MARGIN_DROP_RELEVANT_PP, !improved),
    title: improved ? "Margem líquida melhorou" : "Margem líquida caiu",
    description: `A margem líquida foi de ${previousFmt} para ${currentFmt} (${deltaFmt}) em relação ao período anterior.`,
    recommendation: improved
      ? null
      : "Verifique se custos ou despesas cresceram mais rápido que o faturamento neste período.",
    currentValue: snapshot.margin.current,
    previousValue: snapshot.margin.previous,
    variationAbsolute: delta,
    variationPercent: null,
    variationKind: "POINTS",
    source: "financeiro",
  };
}

function evaluateExpenseGrowth(snapshot: IndicatorSnapshot): RawInsightDraft | null {
  if (!snapshot.hasPreviousPeriod) return null;
  const variation = calculateVariationPercent(snapshot.expenses.current, snapshot.expenses.previous);
  if (!isVariationRelevant(variation, EXPENSE_GROWTH_RELEVANT_PCT)) return null;

  const grew = variation!.greaterThan(0);
  const currentFmt = formatMoney(snapshot.expenses.current, snapshot.currency);
  const previousFmt = formatMoney(snapshot.expenses.previous, snapshot.currency);
  const variationFmt = formatVariation(variation);

  return {
    category: "PROFITABILITY",
    metric: "EXPENSE_GROWTH",
    priority: severityFromMagnitude(variation!.abs(), EXPENSE_GROWTH_RELEVANT_PCT, grew),
    title: grew ? "Despesas em alta" : "Despesas em queda",
    description: `As despesas de ${snapshot.periodLabel} somaram ${currentFmt}, uma variação de ${variationFmt} em relação a ${previousFmt} no período anterior.`,
    recommendation: grew
      ? "Confira o detalhamento por categoria para identificar de onde veio o aumento."
      : null,
    currentValue: snapshot.expenses.current,
    previousValue: snapshot.expenses.previous,
    variationAbsolute: snapshot.expenses.current.minus(snapshot.expenses.previous),
    variationPercent: variation,
    variationKind: "PERCENT",
    source: "financeiro",
  };
}

function evaluateTicketAverageChange(snapshot: IndicatorSnapshot): RawInsightDraft | null {
  if (!snapshot.hasPreviousPeriod) return null;
  if (snapshot.ticketAverage.current === null || snapshot.ticketAverage.previous === null) return null;
  const variation = calculateVariationPercent(snapshot.ticketAverage.current, snapshot.ticketAverage.previous);
  if (!isVariationRelevant(variation, TICKET_CHANGE_RELEVANT_PCT)) return null;

  const grew = variation!.greaterThan(0);
  const currentFmt = formatMoney(snapshot.ticketAverage.current, snapshot.currency);
  const previousFmt = formatMoney(snapshot.ticketAverage.previous, snapshot.currency);
  const variationFmt = formatVariation(variation);

  return {
    category: "SALES",
    metric: "TICKET_AVERAGE_CHANGE",
    priority: severityFromMagnitude(variation!.abs(), TICKET_CHANGE_RELEVANT_PCT, !grew),
    title: grew ? "Ticket médio de vendas subiu" : "Ticket médio de vendas caiu",
    description: `O ticket médio das vendas de ${snapshot.periodLabel} foi ${currentFmt}, uma variação de ${variationFmt} em relação a ${previousFmt} no período anterior.`,
    recommendation: grew ? null : "Avalie se clientes estão comprando menos por venda ou se houve mais descontos.",
    currentValue: snapshot.ticketAverage.current,
    previousValue: snapshot.ticketAverage.previous,
    variationAbsolute: snapshot.ticketAverage.current.minus(snapshot.ticketAverage.previous),
    variationPercent: variation,
    variationKind: "PERCENT",
    source: "vendas",
  };
}

function evaluateReceivablesOverdue(snapshot: IndicatorSnapshot): RawInsightDraft | null {
  if (!snapshot.hasPreviousPeriod) return null;
  const variation = calculateVariationPercent(snapshot.receivablesOverdue.current, snapshot.receivablesOverdue.previous);
  if (!isVariationRelevant(variation, OVERDUE_INCREASE_RELEVANT_PCT)) return null;

  const worsened = variation!.greaterThan(0);
  const currentFmt = formatMoney(snapshot.receivablesOverdue.current, snapshot.currency);
  const previousFmt = formatMoney(snapshot.receivablesOverdue.previous, snapshot.currency);
  const variationFmt = formatVariation(variation);

  return {
    category: "RECEIVABLES",
    metric: "RECEIVABLES_OVERDUE_CHANGE",
    priority: severityFromMagnitude(variation!.abs(), OVERDUE_INCREASE_RELEVANT_PCT, worsened),
    title: worsened ? "Mais contas a receber vencidas" : "Menos contas a receber vencidas",
    // Frase deliberadamente qualificada ("com vencimento em") - este numero
    // NAO e o mesmo total exibido em /financeiro (Contas a Receber), que soma
    // todo vencido hoje independente do mes de vencimento. Ver
    // getOverdueAmountForDueRange em finance/bills/queries.ts.
    description: `Das contas a receber com vencimento em ${snapshot.periodLabel}, ${currentFmt} continuam vencidas até hoje - uma variação de ${variationFmt} em relação ao valor equivalente do período anterior (${previousFmt}).`,
    recommendation: worsened
      ? "Priorize a cobrança das parcelas mais antigas na tela de Contas a Receber."
      : null,
    currentValue: snapshot.receivablesOverdue.current,
    previousValue: snapshot.receivablesOverdue.previous,
    variationAbsolute: snapshot.receivablesOverdue.current.minus(snapshot.receivablesOverdue.previous),
    variationPercent: variation,
    variationKind: "PERCENT",
    source: "contas_a_receber",
  };
}

function evaluateClientConcentration(snapshot: IndicatorSnapshot): RawInsightDraft | null {
  const { topClientShare, topClientName, sampleSize } = snapshot.clientConcentration;
  if (sampleSize < MIN_CLIENTS_FOR_CONCENTRATION_INSIGHT) return null;
  if (topClientShare === null || topClientName === null) return null;
  if (!topClientShare.greaterThanOrEqualTo(CONCENTRATION_RELEVANT_SHARE_PCT)) return null;

  const shareFmt = formatPercent(topClientShare);

  return {
    category: "CLIENTS",
    metric: "CLIENT_CONCENTRATION",
    priority: topClientShare.greaterThanOrEqualTo(CONCENTRATION_RELEVANT_SHARE_PCT * 2) ? "CRITICAL" : "ATTENTION",
    title: "Faturamento concentrado em poucos clientes",
    description: `${topClientName} representa ${shareFmt} do faturamento em vendas de ${snapshot.periodLabel}, entre ${sampleSize} clientes ativos.`,
    recommendation: "Considere diversificar a carteira de clientes para reduzir a dependência de um único comprador.",
    currentValue: topClientShare,
    previousValue: null,
    variationAbsolute: null,
    variationPercent: null,
    variationKind: null,
    source: "vendas",
  };
}

function evaluateClientInactivity(snapshot: IndicatorSnapshot): RawInsightDraft | null {
  if (!snapshot.hasPreviousPeriod) return null;
  if (snapshot.clientConcentration.sampleSize < MIN_CLIENTS_FOR_CONCENTRATION_INSIGHT) return null;

  const relevant = snapshot.clientInactivity.churnedClients
    .filter((c) => c.previousShare.greaterThanOrEqualTo(INACTIVITY_MIN_PREVIOUS_SHARE_PCT))
    .sort((a, b) => b.previousShare.comparedTo(a.previousShare));
  if (relevant.length === 0) return null;

  const top = relevant[0];
  const shareFmt = formatPercent(top.previousShare);
  const others = relevant.length - 1;
  const clientsText = others > 0 ? `${top.name} e mais ${others} cliente(s)` : top.name;

  return {
    category: "CLIENTS",
    metric: "CLIENT_INACTIVITY",
    priority: top.previousShare.greaterThanOrEqualTo(INACTIVITY_MIN_PREVIOUS_SHARE_PCT * 2) ? "CRITICAL" : "ATTENTION",
    title: "Cliente relevante parou de comprar",
    description: `${clientsText} comprava(m) no período anterior (${shareFmt} do faturamento de então) e não teve(tiveram) nenhuma venda em ${snapshot.periodLabel}.`,
    recommendation: "Entre em contato para entender o motivo e tentar reativar a compra.",
    currentValue: null,
    previousValue: top.previousShare,
    variationAbsolute: null,
    variationPercent: null,
    variationKind: null,
    source: "vendas",
  };
}

// Switch exaustivo (estilo deriveBillStatus): adicionar uma metrica ao enum
// InsightMetric sem o case correspondente aqui falha `tsc`, nunca fica
// inerte em silencio. `evaluateSnapshot` e o unico ponto de entrada publico.
function evaluateMetric(metric: InsightMetric, snapshot: IndicatorSnapshot): RawInsightDraft | null {
  switch (metric) {
    case "REVENUE_GROWTH":
      return evaluateRevenueGrowth(snapshot);
    case "MARGIN_CHANGE":
      return evaluateMarginChange(snapshot);
    case "EXPENSE_GROWTH":
      return evaluateExpenseGrowth(snapshot);
    case "TICKET_AVERAGE_CHANGE":
      return evaluateTicketAverageChange(snapshot);
    case "RECEIVABLES_OVERDUE_CHANGE":
      return evaluateReceivablesOverdue(snapshot);
    case "CLIENT_CONCENTRATION":
      return evaluateClientConcentration(snapshot);
    case "CLIENT_INACTIVITY":
      return evaluateClientInactivity(snapshot);
    default: {
      const exhaustiveCheck: never = metric;
      throw new Error(`Métrica não tratada: ${exhaustiveCheck}`);
    }
  }
}

const ALL_METRICS: InsightMetric[] = [
  "REVENUE_GROWTH",
  "MARGIN_CHANGE",
  "EXPENSE_GROWTH",
  "TICKET_AVERAGE_CHANGE",
  "RECEIVABLES_OVERDUE_CHANGE",
  "CLIENT_CONCENTRATION",
  "CLIENT_INACTIVITY",
];

export function evaluateSnapshot(snapshot: IndicatorSnapshot): InsightDraft[] {
  return ALL_METRICS.map((metric) => evaluateMetric(metric, snapshot))
    .filter((draft): draft is RawInsightDraft => draft !== null)
    .map((draft) => ({ ...draft, narrativeSource: "template" as const }));
}
