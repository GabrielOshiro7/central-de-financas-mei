import type { MonthlyPoint } from "@/lib/finance/queries";

const SERIES_STYLE = [
  { key: "revenue", label: "Faturamento", className: "bg-emerald-500" },
  { key: "costs", label: "Custos", className: "bg-amber-500" },
  { key: "expenses", label: "Despesas", className: "bg-rose-500" },
  { key: "netProfit", label: "Lucro", className: "bg-blue-500" },
] as const;

export function FinancialChart({ series }: { series: MonthlyPoint[] }) {
  const hasData = series.some((m) => m.hasAnyEntries);

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-gray-300 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
        Seus dados financeiros aparecerão aqui.
      </div>
    );
  }

  const maxValue = Math.max(
    1,
    ...series.flatMap((m) => SERIES_STYLE.map((s) => Math.abs(m[s.key].toNumber())))
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-end gap-4 overflow-x-auto pb-2">
        {series.map((point) => (
          <div key={`${point.year}-${point.month}`} className="flex flex-col items-center gap-1">
            <div className="flex h-32 items-end gap-0.5">
              {SERIES_STYLE.map((s) => (
                <div
                  key={s.key}
                  className={`w-2 rounded-t ${s.className}`}
                  style={{
                    height: `${Math.max(2, Math.round((Math.abs(point[s.key].toNumber()) / maxValue) * 100))}%`,
                  }}
                  title={`${s.label}: ${point[s.key].toString()}`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-500 dark:text-neutral-400">{point.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
        {SERIES_STYLE.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.className}`} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
