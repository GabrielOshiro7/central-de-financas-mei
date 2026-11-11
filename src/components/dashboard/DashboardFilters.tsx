"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DASHBOARD_PERIOD_OPTIONS, DEFAULT_PERIOD, type PeriodKey } from "@/lib/finance/period";

// Filtro global do dashboard (secao 6 da Etapa 4): so o PERIODO (lista propria
// da Visao Geral), afetando TODOS os componentes da pagina via searchParams (nao
// ha filtro independente por grafico/card). A comparacao nao e mais escolhida: e
// sempre com o periodo anterior equivalente (o cabecalho mostra o intervalo).
export function DashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = (searchParams.get("period") as PeriodKey | null) ?? DEFAULT_PERIOD;

  // Estado local para o par De/Ate: evita perder o primeiro valor numa
  // digitacao rapida dos dois campos (mesmo padrao de TransactionFilters
  // e TransactionFilters).
  const [start, setStart] = useState(searchParams.get("start") ?? "");
  const [end, setEnd] = useState(searchParams.get("end") ?? "");

  function updateParam(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="dashboard-period" className="text-xs text-gray-500 dark:text-neutral-400">
          Período
        </label>
        <select
          id="dashboard-period"
          value={period}
          onChange={(e) => {
            const value = e.target.value as PeriodKey;
            updateParam({
              period: value === DEFAULT_PERIOD ? null : value,
              start: value === "CUSTOM" ? start : null,
              end: value === "CUSTOM" ? end : null,
            });
          }}
          className="border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {DASHBOARD_PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {period === "CUSTOM" && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="dashboard-start" className="text-xs text-gray-500 dark:text-neutral-400">
              De
            </label>
            <input
              id="dashboard-start"
              type="date"
              value={start}
              onChange={(e) => {
                const value = e.target.value;
                setStart(value);
                updateParam({ start: value || null, end: end || null });
              }}
              className="border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="dashboard-end" className="text-xs text-gray-500 dark:text-neutral-400">
              Até
            </label>
            <input
              id="dashboard-end"
              type="date"
              value={end}
              onChange={(e) => {
                const value = e.target.value;
                setEnd(value);
                updateParam({ start: start || null, end: value || null });
              }}
              className="border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
        </>
      )}
    </div>
  );
}
