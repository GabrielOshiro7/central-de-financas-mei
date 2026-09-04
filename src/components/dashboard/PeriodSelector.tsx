"use client";

import { useRouter, usePathname } from "next/navigation";
import { PERIOD_OPTIONS, DEFAULT_PERIOD, type PeriodKey } from "@/lib/finance/period";

export function PeriodSelector({ value }: { value: PeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(period: PeriodKey) {
    const params = new URLSearchParams();
    if (period !== DEFAULT_PERIOD) {
      params.set("period", period);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value as PeriodKey)}
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
    >
      {PERIOD_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
