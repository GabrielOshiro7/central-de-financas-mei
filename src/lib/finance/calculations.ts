import { Prisma, type FinancialEntryType } from "@prisma/client";

type Decimal = Prisma.Decimal;
const { Decimal } = Prisma;

export type FinancialEntryLike = {
  type: FinancialEntryType;
  amount: Decimal;
};

export type FinancialSummary = {
  revenue: Decimal;
  expenses: Decimal;
  netProfit: Decimal;
  // null quando faturamento = 0 (nao da pra calcular margem, e nao e um erro).
  netMargin: Decimal | null;
  hasRevenueEntries: boolean;
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
  const expenses = sumByType(entries, "EXPENSE");

  // Lucro liquido = Faturamento - Despesas; margem liquida = Lucro liquido / Faturamento.
  // (O tipo "Custo" deixou de existir: o que era custo agora e despesa. Ver migracao
  // 20261120120000_remove_cost_type.)
  const netProfit = revenue.minus(expenses);
  const netMargin = revenue.isZero() ? null : netProfit.dividedBy(revenue).times(100);

  return {
    revenue,
    expenses,
    netProfit,
    netMargin,
    hasRevenueEntries: entries.some((e) => e.type === "REVENUE"),
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
  // null quando o total do tipo (despesas) no periodo e zero.
  percentage: Decimal | null;
};

// Agrupa lancamentos de um unico tipo (despesa) por categoria e
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

// Acima disso, uma variacao percentual deixa de ser interpretavel para um
// dono de pequeno negocio (ex.: "+490.000%" nao comunica nada util) - o
// motivo de existir e legibilidade, nao armazenamento. Como efeito colateral
// conveniente, tambem evita o overflow de Insight.variationPercent
// (Decimal(7,4) no schema, que só cabe ate ±999.9999) - mas isso é
// consequência, não a razão do limite.
const MAX_READABLE_VARIATION_PERCENT = 999.99;

// Variacao percentual entre o valor atual e o anterior. Retorna null (N/A)
// quando o valor anterior e zero - nao da pra calcular uma variacao percentual
// significativa a partir de uma base zero (secao 16). Tambem retorna null
// quando o valor anterior e tao pequeno (perto de zero, mas nao exatamente)
// que a variacao resultante ultrapassa MAX_READABLE_VARIATION_PERCENT -
// mesmo raciocinio do "sem base de comparacao" de describeSignedGrowth logo
// abaixo, so que para uma base degenerada em vez de zero.
export function calculateVariationPercent(current: Decimal, previous: Decimal): Decimal | null {
  if (previous.isZero()) return null;
  const variation = current.minus(previous).dividedBy(previous.abs()).times(100);
  if (variation.abs().greaterThan(MAX_READABLE_VARIATION_PERCENT)) return null;
  return variation;
}

// Diferenca em pontos percentuais entre duas margens (nao e variacao
// percentual relativa - e a subtracao direta dos dois percentuais).
export function marginPointsDelta(current: Decimal | null, previous: Decimal | null): Decimal | null {
  if (current === null || previous === null) return null;
  return current.minus(previous);
}

// Crescimento entre dois valores que podem trocar de sinal (lucro bruto/
// liquido - diferente de receita/despesas, que sao sempre >= 0).
// calculateVariationPercent (acima) e usado pelos alertas/indicadores ja
// testados e continua exatamente como esta; esta funcao e so para os
// lugares que precisam soletrar explicitamente uma troca de sinal (prejuizo
// -> lucro ou vice-versa), onde uma "variacao percentual" e matematicamente
// enganosa (ADENDO da Etapa 4: ex. de -500 pra +300 nao e "-160%" de nada
// util pro usuario leigo).
export type SignedGrowth =
  | { kind: "no_base" }
  | { kind: "sign_flip"; fromNegative: boolean; previous: Decimal; current: Decimal }
  | { kind: "percent"; value: Decimal };

export function describeSignedGrowth(current: Decimal, previous: Decimal): SignedGrowth {
  if (previous.isZero()) return { kind: "no_base" };

  // gt(0)/lt(0) em vez de isPositive()/isNegative(): em decimal.js,
  // Decimal(0).isPositive() e' true (zero nao tem sinal, e tratado como nao-
  // negativo), entao isPositive() sozinho classificaria "prejuizo -> exatamente
  // zero" como troca de sinal - o ADENDO da Etapa 4 exige estritamente "atual
  // > 0" (ou < 0), entao zero cai no ramo normal de porcentagem abaixo.
  const signFlipped = (previous.gt(0) && current.lt(0)) || (previous.lt(0) && current.gt(0));
  if (signFlipped) {
    return { kind: "sign_flip", fromNegative: previous.isNegative(), previous, current };
  }

  const value = calculateVariationPercent(current, previous);
  return value === null ? { kind: "no_base" } : { kind: "percent", value };
}

export type AverageTicketResult =
  | { status: "unavailable"; reason: string }
  | { status: "ok"; amount: Decimal };

// Nao ha campo de quantidade/numero de vendas em FinancialEntry nem na
// importacao (ver IMPORT_COLUMNS) - por isso sempre retorna "unavailable"
// hoje (secao 20/28 da Etapa 4: "N/D" em vez de inventar). A assinatura ja
// aceita salesCount para quando esse dado existir, sem precisar redesenhar
// o tipo de retorno nos componentes que o consomem.
export function calculateAverageTicket(revenue: Decimal, salesCount: number | null): AverageTicketResult {
  if (salesCount === null || salesCount <= 0) {
    return { status: "unavailable", reason: "Quantidade de vendas não disponível." };
  }
  return { status: "ok", amount: revenue.dividedBy(salesCount) };
}

export type TopCategoriesRanking = {
  entries: CategoryBreakdownEntry[];
  otherAmount: Decimal | null;
  otherPercentage: Decimal | null;
  grandTotal: Decimal;
};

// Ranking unico "Principais gastos" (secao 19 da Etapa 4): top N + "Outros" das despesas por
// categoria. Deliberadamente separado do grafico de distribuicao por categoria
// (CategoryBreakdownChart): os dois recortes coexistem, nao se substituem.
export function buildTopCategoriesRanking(
  entries: { categoryId: string; categoryName: string; amount: Decimal }[],
  limit = 5
): TopCategoriesRanking {
  const all = summarizeByCategory(entries);
  const grandTotal = all.reduce((total, e) => total.plus(e.amount), new Decimal(0));
  const top = all.slice(0, limit);
  const rest = all.slice(limit);
  const otherAmount = rest.length > 0 ? rest.reduce((total, e) => total.plus(e.amount), new Decimal(0)) : null;
  const otherPercentage =
    otherAmount !== null && !grandTotal.isZero() ? otherAmount.dividedBy(grandTotal).times(100) : null;

  return { entries: top, otherAmount, otherPercentage, grandTotal };
}
