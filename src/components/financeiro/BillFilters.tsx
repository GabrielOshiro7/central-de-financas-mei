"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { BillDisplayStatus, BillDirection } from "@/lib/finance/bills/status";
import { billStatusLabel } from "@/lib/finance/bills/status";
import { DUE_SOON_OPTIONS } from "@/lib/finance/bills/options";

export type BillFilterCategoryOption = { id: string; name: string };

const STATUS_VALUES: BillDisplayStatus[] = ["PENDING", "OVERDUE", "PAID", "CANCELLED"];

export function BillFilters({
  direction,
  categories,
}: {
  direction: BillDirection;
  categories: BillFilterCategoryOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const due = searchParams.get("due") ?? "";
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="min-w-[220px] flex-1">
          <label htmlFor="bill-search" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
            Pesquisar
          </label>
          <input
            id="bill-search"
            type="search"
            value={search}
            placeholder="Descrição, documento, categoria..."
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateParam({ q: search || null });
            }}
            onBlur={() => updateParam({ q: search || null })}
            className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>

        <div>
          <label htmlFor="bill-status" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
            Status
          </label>
          <select
            id="bill-status"
            value={status}
            onChange={(e) => updateParam({ status: e.target.value || null })}
            className="border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="">Todas</option>
            {STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {billStatusLabel(direction, value)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bill-category" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
            Categoria
          </label>
          <select
            id="bill-category"
            value={categoryId}
            onChange={(e) => updateParam({ categoryId: e.target.value || null })}
            className="border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateParam({ due: null })}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            due === ""
              ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400"
          }`}
        >
          Todos os vencimentos
        </button>
        {DUE_SOON_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => updateParam({ due: opt.value })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              due === opt.value
                ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
