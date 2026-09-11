import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { summarizeEntries } from "@/lib/finance/calculations";
import { calculateAccumulatedBalance } from "@/lib/finance/cash/calculations";
import { monthsBetween } from "@/lib/finance/period";

const { Decimal } = Prisma;

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type BusinessOpeningBalance = { openingBalance: Prisma.Decimal; openingBalanceDate: Date | null };

export type EffectiveOpeningBalance = {
  amount: Prisma.Decimal;
  date: Date;
  configured: boolean;
};

// Resolve a base real do calculo (Etapa 5.1): se openingBalanceDate estiver
// configurado, usa exatamente o que a empresa configurou (configured=true).
// Senao, cai no fallback implicito documentado no schema - data do primeiro
// FinancialEntry, saldo inicial = 0 nessa data (configured=false, a UI usa
// isso para mostrar o banner de "nao configurado"). Retorna null quando NAO
// HA base nenhuma pra calcular (nao configurado E nenhum lancamento ainda) -
// o chamador trata isso como estado vazio, igual ao hasAnyFinancialEntriesEver
// do dashboard.
export async function resolveEffectiveOpeningBalance(
  businessId: string,
  business: BusinessOpeningBalance
): Promise<EffectiveOpeningBalance | null> {
  if (business.openingBalanceDate) {
    return { amount: business.openingBalance, date: business.openingBalanceDate, configured: true };
  }

  const first = await prisma.financialEntry.findFirst({
    where: { businessId },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true },
  });
  if (!first) return null;

  return { amount: new Decimal(0), date: first.occurredAt, configured: false };
}

export type CashBalance = {
  balance: Prisma.Decimal;
  asOfDate: Date;
  configured: boolean;
};

// Saldo atual (card em destaque da aba Caixa) - sempre "ate hoje", nunca
// afetado pelo filtro de periodo do grafico (esse filtro so recorta a serie
// mensal abaixo). Busca TODOS os FinancialEntry realizados apos a data
// efetiva, independente de source (MANUAL/IMPORT/RECURRING/BILL) - nunca
// Bill PENDING, que nem e FinancialEntry.
export async function getCurrentCashBalance(
  businessId: string,
  business: BusinessOpeningBalance
): Promise<CashBalance | null> {
  const effective = await resolveEffectiveOpeningBalance(businessId, business);
  if (!effective) return null;

  const entries = await prisma.financialEntry.findMany({
    where: { businessId, occurredAt: { gt: effective.date } },
    select: { type: true, amount: true, occurredAt: true },
  });

  const balance = calculateAccumulatedBalance(effective.amount, effective.date, entries);
  return { balance, asOfDate: effective.date, configured: effective.configured };
}

export type CashMonthlyPoint = {
  year: number;
  month: number;
  label: string;
  balance: Prisma.Decimal;
};

// Serie mensal (evolucao do caixa, secao "INTERFACE" da Etapa 5.1) - saldo
// ACUMULADO ao final de cada mes civil, desde a data efetiva ate o mes de
// `now` (inclusive). Mesmo principio de eficiencia ja usado em
// getMonthlySeriesForRange (finance/queries.ts): UMA UNICA query busca todos
// os lancamentos qualificados de uma vez, o agrupamento por mes e a soma
// corrida acontecem em memoria - nunca uma query por mes. Reaproveita
// monthsBetween (period.ts) para a lista de meses civis, mesma convencao de
// "mes" usada no resto do financeiro/dashboard.
export async function getMonthlyCashSeries(
  businessId: string,
  business: BusinessOpeningBalance,
  now: Date = new Date()
): Promise<CashMonthlyPoint[]> {
  const effective = await resolveEffectiveOpeningBalance(businessId, business);
  if (!effective) return [];

  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const months = monthsBetween(effective.date, rangeEnd);
  if (months.length === 0) return [];

  const entries = await prisma.financialEntry.findMany({
    where: { businessId, occurredAt: { gt: effective.date, lt: rangeEnd } },
    select: { type: true, amount: true, occurredAt: true },
  });

  let running = effective.amount;
  return months.map(({ year, month }) => {
    const monthEntries = entries.filter(
      (e) => e.occurredAt.getFullYear() === year && e.occurredAt.getMonth() === month
    );
    const { netProfit } = summarizeEntries(monthEntries);
    running = running.plus(netProfit);
    return { year, month, label: MONTH_LABELS[month], balance: running };
  });
}
