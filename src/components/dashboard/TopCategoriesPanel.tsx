import type { Currency } from "@prisma/client";
import type { TopCategoriesRanking } from "@/lib/finance/calculations";
import { formatMoney } from "@/lib/money";
import { formatPercent } from "@/lib/finance/format";

// "Principais gastos" (secao 19 da Etapa 4) - ranking combinado de Custos +
// Despesas (buildTopCategoriesRanking em calculations.ts), separado dos
// graficos de distribuicao por tipo das secoes 17/18 (CategoryBreakdownChart).
export function TopCategoriesPanel({ ranking, currency }: { ranking: TopCategoriesRanking; currency: Currency }) {
  const hasData = ranking.entries.length > 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Principais gastos</h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">Custos e despesas combinados no período.</p>

      {!hasData ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-neutral-400">Sem gastos registrados neste período.</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2">
          {ranking.entries.map((entry, i) => (
            <li key={entry.categoryId} className="flex items-center justify-between text-sm">
              <span className="text-gray-700 dark:text-neutral-300">
                {i + 1}. {entry.categoryName}
              </span>
              <span className="font-medium text-gray-900 dark:text-neutral-100">
                {formatMoney(entry.amount, currency)}
                {entry.percentage !== null ? ` (${formatPercent(entry.percentage)})` : ""}
              </span>
            </li>
          ))}
          {ranking.otherAmount !== null && (
            <li className="flex items-center justify-between text-sm text-gray-500 dark:text-neutral-400">
              <span>Outros</span>
              <span>
                {formatMoney(ranking.otherAmount, currency)}
                {ranking.otherPercentage !== null ? ` (${formatPercent(ranking.otherPercentage)})` : ""}
              </span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
