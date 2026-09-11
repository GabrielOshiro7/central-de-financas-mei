import { Prisma, type Currency } from "@prisma/client";
import { getFinancialSummaryForRange, hasFinancialEntriesBefore } from "@/lib/finance/queries";
import { getOverdueAmountForDueRange } from "@/lib/finance/bills/queries";
import { getSalesSummary, getTopClients } from "@/lib/sales/queries";
import { resolvePeriodRange, getPreviousPeriodRange, type PeriodRange } from "@/lib/finance/period";

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

// Recorta o range do mes anterior ate o MESMO dia-do-mes do periodo atual em
// andamento, para nunca comparar N dias do mes atual contra o mes anterior
// inteiro (o que inflaria uma queda/alta artificial so por o mes atual ainda
// nao ter terminado).
//
// Tratamento explicito do dia inexistente: `new Date(year, month, dia)` do
// JS ROLA SILENCIOSAMENTE para o mes seguinte quando `dia` nao existe naquele
// mes (ex.: new Date(2026, 1, 31) vira 2 ou 3 de marco, nao um erro) - por
// isso o dia de referencia e sempre clampado ao ultimo dia real do mes
// anterior antes de montar a data. "Dia 31" comparado a um fevereiro de 28
// dias vira "fevereiro inteiro" (o melhor recorte possivel), nunca um
// vazamento para marco.
export function clipToSameDayOfMonth(
  range: { start: Date; end: Date },
  referenceDay: number
): { start: Date; end: Date } {
  const year = range.start.getFullYear();
  const month = range.start.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(referenceDay, daysInMonth);
  return { start: range.start, end: new Date(year, month, clampedDay + 1, 0, 0, 0, 0) };
}

export function resolveInsightPeriods(now: Date): {
  current: PeriodRange;
  previousClipped: { start: Date; end: Date };
  isPartial: boolean;
} {
  const current = resolvePeriodRange("THIS_MONTH", now);
  const previousFull = getPreviousPeriodRange(current);
  const previousClipped = clipToSameDayOfMonth(previousFull, now.getDate());
  // Mes em andamento = ainda ha instantes futuros dentro do range atual
  // (mesma nocao de "hoje" usada em todo o resto do financeiro/dashboard).
  const isPartial = current.end.getTime() > now.getTime();
  return { current, previousClipped, isPartial };
}

export function getPeriodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

export type ChurnedClient = { clientId: string; name: string; previousShare: Decimal };

export type IndicatorSnapshot = {
  currency: Currency;
  periodKey: string;
  // "setembro de 2026" - so para compor os textos narrativos de rules.ts.
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  comparisonPeriodStart: Date;
  comparisonPeriodEnd: Date;
  isPartial: boolean;
  // Deliberadamente independente do range recortado acima - ver
  // hasFinancialEntriesBefore em finance/queries.ts.
  hasPreviousPeriod: boolean;

  revenue: { current: Decimal; previous: Decimal };
  margin: { current: Decimal | null; previous: Decimal | null };
  expenses: { current: Decimal; previous: Decimal };
  ticketAverage: { current: Decimal | null; previous: Decimal | null };
  receivablesOverdue: { current: Decimal; previous: Decimal };
  clientConcentration: {
    topClientName: string | null;
    // % do faturamento de vendas do periodo atual concentrado no maior cliente.
    topClientShare: Decimal | null;
    sampleSize: number;
  };
  clientInactivity: {
    churnedClients: ChurnedClient[];
  };
};

// Orquestracao pura e fina (Etapa 7): o UNICO modulo que conversa com
// finance/queries.ts, finance/bills/queries.ts e sales/queries.ts - rules.ts
// nunca importa Prisma diretamente, so enxerga o IndicatorSnapshot já
// pronto. Nenhum calculo financeiro e refeito aqui: cada numero vem de um
// getter que ja existia antes da Etapa 7 (ou foi adicionado ao modulo DONO
// daquele dado, nunca duplicado aqui).
export async function computeIndicatorSnapshot(
  businessId: string,
  currency: Currency,
  now: Date = new Date()
): Promise<IndicatorSnapshot> {
  const { current, previousClipped, isPartial } = resolveInsightPeriods(now);

  const [
    hasPreviousPeriod,
    currentSummary,
    previousSummary,
    currentSales,
    previousSales,
    currentTopClients,
    previousTopClients,
    currentOverdue,
    previousOverdue,
  ] = await Promise.all([
    hasFinancialEntriesBefore(businessId, current.start),
    getFinancialSummaryForRange(businessId, current),
    getFinancialSummaryForRange(businessId, previousClipped),
    getSalesSummary(businessId, current, now),
    getSalesSummary(businessId, previousClipped, now),
    getTopClients(businessId, current, 1000),
    getTopClients(businessId, previousClipped, 1000),
    getOverdueAmountForDueRange(businessId, "RECEIVABLE", current, now),
    getOverdueAmountForDueRange(businessId, "RECEIVABLE", previousClipped, now),
  ]);

  const topClient = currentTopClients[0] ?? null;
  const topClientShare =
    topClient && !currentSales.totalRevenue.isZero()
      ? topClient.totalPurchased.dividedBy(currentSales.totalRevenue).times(100)
      : null;

  // Inatividade: clientes que compraram no periodo anterior e sumiram no
  // atual. previousShare e calculado sobre o faturamento de vendas do
  // PERIODO ANTERIOR (nao o atual) - "esse cliente representava X% do
  // faturamento de entao", a base natural pra medir o quanto a saida dele
  // pesou.
  const currentClientIds = new Set(currentTopClients.map((c) => c.clientId));
  const churnedClients: ChurnedClient[] = previousTopClients
    .filter((c) => !currentClientIds.has(c.clientId))
    .map((c) => ({
      clientId: c.clientId,
      name: c.clientName,
      previousShare: previousSales.totalRevenue.isZero()
        ? new Decimal(0)
        : c.totalPurchased.dividedBy(previousSales.totalRevenue).times(100),
    }));

  return {
    currency,
    periodKey: getPeriodKey(current.start),
    periodLabel: formatMonthLabel(current.start),
    periodStart: current.start,
    periodEnd: current.end,
    comparisonPeriodStart: previousClipped.start,
    comparisonPeriodEnd: previousClipped.end,
    isPartial,
    hasPreviousPeriod,
    revenue: { current: currentSummary.revenue, previous: previousSummary.revenue },
    margin: { current: currentSummary.netMargin, previous: previousSummary.netMargin },
    expenses: { current: currentSummary.expenses, previous: previousSummary.expenses },
    ticketAverage: { current: currentSales.averageTicket, previous: previousSales.averageTicket },
    receivablesOverdue: { current: currentOverdue, previous: previousOverdue },
    clientConcentration: {
      topClientName: topClient?.clientName ?? null,
      topClientShare,
      sampleSize: currentTopClients.length,
    },
    clientInactivity: { churnedClients },
  };
}
