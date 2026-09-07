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
  grossMargin: Decimal | null;
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

  // Margem bruta = (Faturamento - Custos) / Faturamento (secao 17).
  const grossProfit = revenue.minus(costs);
  // Lucro liquido = Faturamento - Custos - Despesas (secao 15/18); margem
  // liquida = Lucro liquido / Faturamento.
  const netProfit = grossProfit.minus(expenses);
  const grossMargin = revenue.isZero() ? null : grossProfit.dividedBy(revenue).times(100);
  const netMargin = revenue.isZero() ? null : netProfit.dividedBy(revenue).times(100);

  return {
    revenue,
    costs,
    expenses,
    grossProfit,
    netProfit,
    grossMargin,
    netMargin,
    hasRevenueEntries: entries.some((e) => e.type === "REVENUE"),
    hasCostEntries: entries.some((e) => e.type === "COST"),
    hasExpenseEntries: entries.some((e) => e.type === "EXPENSE"),
    hasAnyEntries: entries.length > 0,
  };
}

export type CategoryAmount = {
  categoryId: string;
  categoryName: string;
  amount: Decimal;
};

export type CategoryBreakdownEntry = CategoryAmount & {
  // null quando o total do tipo (custos ou despesas) no periodo e zero.
  percentage: Decimal | null;
};

// Agrupa lancamentos de um unico tipo (custo ou despesa) por categoria e
// calcula a fatia percentual de cada uma sobre o total do periodo. Usado nos
// graficos 2/3 (distribuicao) e no alerta de categoria concentrada (secao 20).
export function summarizeByCategory(
  entries: { categoryId: string; categoryName: string; amount: Decimal }[]
): CategoryBreakdownEntry[] {
  const totals = new Map<string, CategoryAmount>();

  for (const entry of entries) {
    const existing = totals.get(entry.categoryId);
    if (existing) {
      existing.amount = existing.amount.plus(entry.amount);
    } else {
      totals.set(entry.categoryId, {
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        amount: entry.amount,
      });
    }
  }

  const grandTotal = entries.reduce((total, e) => total.plus(e.amount), new Decimal(0));

  return Array.from(totals.values())
    .map((c) => ({
      ...c,
      percentage: grandTotal.isZero() ? null : c.amount.dividedBy(grandTotal).times(100),
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));
}

// Variacao percentual entre o valor atual e o anterior. Retorna null (N/A)
// quando o valor anterior e zero - nao da pra calcular uma variacao percentual
// significativa a partir de uma base zero (secao 16).
export function calculateVariationPercent(current: Decimal, previous: Decimal): Decimal | null {
  if (previous.isZero()) return null;
  return current.minus(previous).dividedBy(previous.abs()).times(100);
}

// Diferenca em pontos percentuais entre duas margens (nao e variacao
// percentual relativa - e a subtracao direta dos dois percentuais).
export function marginPointsDelta(current: Decimal | null, previous: Decimal | null): Decimal | null {
  if (current === null || previous === null) return null;
  return current.minus(previous);
}
