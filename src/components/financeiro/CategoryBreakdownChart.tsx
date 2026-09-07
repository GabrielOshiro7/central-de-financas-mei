import type { Currency } from "@prisma/client";
import type { CategoryBreakdownEntry } from "@/lib/finance/calculations";
import { formatMoney } from "@/lib/money";

const BAR_COLORS = ["bg-blue-500", "bg-purple-500", "bg-pink-500", "bg-amber-500", "bg-teal-500", "bg-rose-500"];

export function CategoryBreakdownChart({
  title,
  entries,
  currency,
}: {
  title: string;
  entries: CategoryBreakdownEntry[];
  currency: Currency | null;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{title}</h2>
        <p className="mt-3 text-sm text-gray-500 dark:text-neutral-400">Sem dados neste período.</p>
      </div>
    );
  }

  const top = entries.slice(0, 6);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{title}</h2>
      <div className="mt-4 flex flex-col gap-3">
        {top.map((entry, i) => (
          <div key={entry.categoryId}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700 dark:text-neutral-300">{entry.categoryName}</span>
              <span className="font-medium text-gray-900 dark:text-neutral-100">
                {currency ? formatMoney(entry.amount, currency) : entry.amount.toString()}
                {entry.percentage !== null ? ` (${entry.percentage.toFixed(1)}%)` : ""}
              </span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-100 dark:bg-neutral-800">
              <div
                className={`h-2 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
                style={{ width: `${Math.max(2, entry.percentage?.toNumber() ?? 0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
