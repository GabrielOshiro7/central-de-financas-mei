import { AlertTriangle } from "lucide-react";
import type { FinancialAlert } from "@/lib/finance/insights";

export function AlertsPanel({ alerts }: { alerts: FinancialAlert[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Pontos de atenção</h2>
      {alerts.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">
          Nenhum ponto de atenção identificado neste período.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-start gap-2 text-sm text-gray-700 dark:text-neutral-300">
              <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{alert.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
