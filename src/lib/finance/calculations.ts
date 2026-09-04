import { Prisma, type FinancialEntryType } from "@prisma/client";

type Decimal = Prisma.Decimal;
const { Decimal } = Prisma;

export type FinancialEntryLike = {
  type: FinancialEntryType;
  amount: Decimal;
};

export type FinancialSummary = {
  revenue: Decimal;
  costs: Decimal;
  expenses: Decimal;
  grossProfit: Decimal;
  netProfit: Decimal;
  // null quando faturamento = 0 (nao da pra calcular margem, e nao e um erro).
  netMargin: Decimal | null;
  hasRevenueEntries: boolean;
  hasCostEntries: boolean;
  hasExpenseEntries: boolean;
  hasAnyEntries: boolean;
};

function sumByType(entries: FinancialEntryLike[], type: FinancialEntryType): Decimal {
  return entries
    .filter((e) => e.type === type)
    .reduce((total, e) => total.plus(e.amount), new Decimal(0));
}

export function summarizeEntries(entries: FinancialEntryLike[]): FinancialSummary {
  const revenue = sumByType(entries, "REVENUE");
  const costs = sumByType(entries, "COST");
  const expenses = sumByType(entries, "EXPENSE");

  const grossProfit = revenue.minus(costs);
  const netProfit = grossProfit.minus(expenses);
  const netMargin = revenue.isZero() ? null : netProfit.dividedBy(revenue).times(100);

  return {
    revenue,
    costs,
    expenses,
    grossProfit,
    netProfit,
    netMargin,
    hasRevenueEntries: entries.some((e) => e.type === "REVENUE"),
    hasCostEntries: entries.some((e) => e.type === "COST"),
    hasExpenseEntries: entries.some((e) => e.type === "EXPENSE"),
    hasAnyEntries: entries.length > 0,
  };
}
