"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CLIENT_STATUS_OPTIONS } from "@/lib/clients/options";

export function ClientFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "ACTIVE";
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
    <div className="flex flex-wrap items-end gap-3 border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-[220px] flex-1">
        <label htmlFor="client-search" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
          Pesquisar
        </label>
        <input
          id="client-search"
          type="search"
          value={search}
          placeholder="Nome, telefone, e-mail, documento..."
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParam({ q: search || null });
          }}
          onBlur={() => updateParam({ q: search || null })}
          className="w-full border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
      </div>

      <div>
        <label htmlFor="client-status" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
          Status
        </label>
        <select
          id="client-status"
          value={status}
          onChange={(e) => updateParam({ status: e.target.value || null })}
          className="border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {CLIENT_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
