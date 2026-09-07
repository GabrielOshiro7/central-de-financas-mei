import { HEALTH_ICONS, HEALTH_LABELS, type FinancialHealth } from "@/lib/finance/insights";

export function HealthBadge({ health }: { health: FinancialHealth }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <span className="text-2xl" aria-hidden="true">
        {HEALTH_ICONS[health]}
      </span>
      <div>
        <div className="text-xs text-gray-500 dark:text-neutral-400">Saúde financeira</div>
        <div className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{HEALTH_LABELS[health]}</div>
      </div>
    </div>
  );
}
