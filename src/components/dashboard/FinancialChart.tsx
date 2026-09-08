import { Prisma } from "@prisma/client";
import type { MonthlyPoint, DailyPoint } from "@/lib/finance/queries";

type Decimal = Prisma.Decimal;

// Forma generica de ponto de serie temporal, independente de granularidade
// (mes ou dia). MonthlyPoint (chave year+month) e DailyPoint (chave date) sao
// convertidos aqui pra essa forma comum - necessario desde que a Etapa 4
// introduziu periodos por dia (TODAY, LAST_7/30/90_DAYS, CUSTOM) que nao
// devem ser agrupados por mes inteiro (ver getDailySeriesForRange/
// getMonthlySeriesForRange em queries.ts e o comentario de alignment em
// period.ts) - vale tanto pro grafico principal de /dashboard quanto pro de
// /financeiro, que compartilham este componente.
export type EvolutionPoint = {
  key: string;
  label: string;
  revenue: Decimal;
  costs: Decimal;
  expenses: Decimal;
  netProfit: Decimal;
  hasAnyEntries: boolean;
};

export function toEvolutionPoints(points: (MonthlyPoint | DailyPoint)[]): EvolutionPoint[] {
  return points.map((p) => ({
    key: "month" in p ? `${p.year}-${p.month}` : p.date.toISOString(),
    label: p.label,
    revenue: p.revenue,
    costs: p.costs,
    expenses: p.expenses,
    netProfit: p.netProfit,
    hasAnyEntries: p.hasAnyEntries,
  }));
}

const SERIES_STYLE = [
  { key: "revenue", label: "Faturamento", className: "bg-emerald-500" },
  { key: "costs", label: "Custos", className: "bg-amber-500" },
  { key: "expenses", label: "Despesas", className: "bg-rose-500" },
  { key: "netProfit", label: "Lucro", className: "bg-blue-500" },
] as const;

export function FinancialChart({ series }: { series: EvolutionPoint[] }) {
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
          <div key={point.key} className="flex flex-col items-center gap-1">
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
