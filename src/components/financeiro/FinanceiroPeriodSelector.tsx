"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PERIOD_OPTIONS, DEFAULT_PERIOD, type PeriodKey } from "@/lib/finance/period";

export function FinanceiroPeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = (searchParams.get("period") as PeriodKey | null) ?? DEFAULT_PERIOD;

  // Estado local para o par De/Ate: evita que preencher os dois campos em
  // sequencia rapida perca o primeiro valor por causa de uma corrida entre o
  // router.push do primeiro campo e o searchParams (possivelmente ainda
  // desatualizado) lido pelo segundo. Ver mesmo comentario em TransactionFilters.
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
      <select
        aria-label="Período"
        value={period}
        onChange={(e) => {
          const value = e.target.value as PeriodKey;
          updateParam({
            period: value === DEFAULT_PERIOD ? null : value,
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

      {period === "CUSTOM" && (
        <>
          <input
            aria-label="De"
            type="date"
            value={start}
            onChange={(e) => {
              const value = e.target.value;
              setStart(value);
              updateParam({ start: value || null, end: end || null });
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <input
            aria-label="Até"
            type="date"
            value={end}
            onChange={(e) => {
              const value = e.target.value;
              setEnd(value);
              updateParam({ start: start || null, end: value || null });
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </>
      )}
    </div>
  );
}
