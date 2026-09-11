"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/finance/period";
import { DEFAULT_CASH_PERIOD } from "@/components/caixa/constants";

// Filtro de periodo so da SERIE do grafico (Etapa 5.1) - o card de saldo
// atual, no topo da pagina, NUNCA muda com este filtro (e sempre "ate hoje").
// DEFAULT_CASH_PERIOD vem de constants.ts (nao "use client") - server
// components (caixa/page.tsx) devem importar de la direto, nunca reexportado
// por este arquivo (todo export de um modulo "use client" vira referencia de
// cliente no Next, mesmo um valor simples).

export function CashPeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = (searchParams.get("period") as PeriodKey | null) ?? DEFAULT_CASH_PERIOD;
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
        <label htmlFor="cash-period" className="text-xs text-gray-500 dark:text-neutral-400">
          Período do gráfico
        </label>
        <select
          id="cash-period"
          value={period}
          onChange={(e) => {
            const value = e.target.value as PeriodKey;
            updateParam({
              period: value === DEFAULT_CASH_PERIOD ? null : value,
              start: value === "CUSTOM" ? start : null,
              end: value === "CUSTOM" ? end : null,
            });
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {period === "CUSTOM" && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="cash-start" className="text-xs text-gray-500 dark:text-neutral-400">
              De
            </label>
            <input
              id="cash-start"
              type="date"
              value={start}
              onChange={(e) => {
                const value = e.target.value;
                setStart(value);
                updateParam({ start: value || null, end: end || null });
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cash-end" className="text-xs text-gray-500 dark:text-neutral-400">
              Até
            </label>
            <input
              id="cash-end"
              type="date"
              value={end}
              onChange={(e) => {
                const value = e.target.value;
                setEnd(value);
                updateParam({ start: start || null, end: value || null });
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
        </>
      )}
    </div>
  );
}
