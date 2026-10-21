"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PERIOD_OPTIONS, DEFAULT_PERIOD, type PeriodKey } from "@/lib/finance/period";
import { SOURCE_OPTIONS } from "@/lib/finance/options";

export type FilterCategoryOption = { id: string; name: string };

export function TransactionFilters({
  categories,
  action,
}: {
  categories: FilterCategoryOption[];
  // Botão de criação da aba (ex.: "Nova receita"), à direita do painel.
  action?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const panelRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  const period = (searchParams.get("period") as PeriodKey | null) ?? DEFAULT_PERIOD;

  // A ação fica à direita (ml-auto) enquanto cabe na mesma linha dos
  // filtros; quando o painel quebra linha ela vai pro fim com largura total.
  // CSS sozinho não sabe se um item de flex-wrap quebrou (e a largura do
  // select de Categoria depende dos nomes cadastrados), então mede: zera o
  // estado, compara a base da ação com a do primeiro filtro (items-end alinha
  // as bases na mesma linha) e grava data-wrapped - tudo síncrono, antes do
  // paint. Abaixo de 640px o CSS já força largura total (sempre quebra ali),
  // pra não haver pulo antes da hidratação.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const actionEl = actionRef.current;
    if (!panel || !actionEl) return;
    const sync = () => {
      const first = panel.firstElementChild as HTMLElement | null;
      if (!first || first === actionEl) return;
      actionEl.dataset.wrapped = "false";
      const actionBottom = actionEl.offsetTop + actionEl.offsetHeight;
      const firstBottom = first.offsetTop + first.offsetHeight;
      actionEl.dataset.wrapped = String(actionBottom > firstBottom + 1);
    };
    sync();
    // jsdom (testes de componente) não tem ResizeObserver.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(panel);
    return () => observer?.disconnect();
  }, [period, action]);
  const categoryId = searchParams.get("categoryId") ?? "";
  const source = searchParams.get("source") ?? "";

  // Estado local para o par De/Ate: se cada campo lesse searchParams direto,
  // preencher os dois rapido (ex.: um usuario digitando rapido, ou testes
  // automatizados) perderia o primeiro valor - o segundo router.push partiria
  // de um searchParams que ainda nao refletia o primeiro push (race
  // condition). Mantendo os dois valores juntos localmente, cada mudanca
  // sempre envia o par completo e atualizado.
  const [customStart, setCustomStart] = useState(searchParams.get("start") ?? "");
  const [customEnd, setCustomEnd] = useState(searchParams.get("end") ?? "");

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
    <div
      ref={panelRef}
      className="flex flex-wrap items-end gap-3 border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div>
        <label htmlFor="filter-period" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
          Período
        </label>
        <select
          id="filter-period"
          value={period}
          onChange={(e) => {
            const value = e.target.value as PeriodKey;
            updateParam({
              period: value === DEFAULT_PERIOD ? null : value,
              start: value === "CUSTOM" ? customStart : null,
              end: value === "CUSTOM" ? customEnd : null,
            });
          }}
          className="h-9.5 border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
          <div>
            <label htmlFor="filter-start" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
              De
            </label>
            <input
              id="filter-start"
              type="date"
              value={customStart}
              onChange={(e) => {
                const value = e.target.value;
                setCustomStart(value);
                updateParam({ start: value || null, end: customEnd || null });
              }}
              className="h-9.5 border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label htmlFor="filter-end" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
              Até
            </label>
            <input
              id="filter-end"
              type="date"
              value={customEnd}
              onChange={(e) => {
                const value = e.target.value;
                setCustomEnd(value);
                updateParam({ start: customStart || null, end: value || null });
              }}
              className="h-9.5 border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="filter-category" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
          Categoria
        </label>
        <select
          id="filter-category"
          value={categoryId}
          onChange={(e) => updateParam({ categoryId: e.target.value || null })}
          className="h-9.5 border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-source" className="mb-1 block text-xs font-medium text-gray-500 dark:text-neutral-400">
          Origem
        </label>
        <select
          id="filter-source"
          value={source}
          onChange={(e) => updateParam({ source: e.target.value || null })}
          className="h-9.5 border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option value="">Todos</option>
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {action && (
        <div ref={actionRef} className="ml-auto flex max-sm:basis-full data-[wrapped=true]:basis-full">
          {action}
        </div>
      )}
    </div>
  );
}
