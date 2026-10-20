"use client";

import { useState } from "react";
import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { ChartTooltip, computeTooltipAnchor, type TooltipAnchor } from "@/components/dashboard/ChartTooltip";
import type { EvolutionPoint } from "@/components/dashboard/evolutionPoints";

export type { EvolutionPoint } from "@/components/dashboard/evolutionPoints";

const SERIES_STYLE = [
  { key: "revenue", label: "Faturamento", className: "bg-emerald-500" },
  { key: "costs", label: "Custos", className: "bg-amber-500" },
  { key: "expenses", label: "Despesas", className: "bg-rose-500" },
  { key: "netProfit", label: "Lucro", className: "bg-blue-500" },
] as const;

function buildAriaLabel(point: EvolutionPoint, currency: Currency): string {
  const parts = SERIES_STYLE.map((s) => `${s.label}: ${formatMoney(point[s.key], currency)}`);
  return `${point.label} — ${parts.join(", ")}`;
}

// `title` fica DENTRO do card (h2), como em todos os outros painéis do
// Dashboard - antes era um h2 solto acima do card, na página.
export function FinancialChart({
  series,
  currency,
  title,
}: {
  series: EvolutionPoint[];
  currency: Currency;
  title?: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);

  const hasData = series.some((m) => m.hasAnyEntries);
  const heading = title ? <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{title}</h2> : null;

  if (!hasData) {
    return (
      <div className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        {heading}
        <div
          className={`flex h-48 items-center justify-center border border-dashed border-gray-300 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400 ${
            heading ? "mt-4" : ""
          }`}
        >
          Seus dados financeiros aparecerão aqui.
        </div>
      </div>
    );
  }

  const maxValue = Math.max(1, ...series.flatMap((m) => SERIES_STYLE.map((s) => Math.abs(m[s.key]))));

  function show(index: number, el: Element) {
    setActiveIndex(index);
    setAnchor(computeTooltipAnchor(el.getBoundingClientRect()));
  }

  function hide() {
    setActiveIndex(null);
    setAnchor(null);
  }

  const activePoint = activeIndex !== null ? series[activeIndex] : null;

  return (
    <div className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      {heading}
      <div className={`flex items-end gap-4 overflow-x-auto pb-2 ${heading ? "mt-4" : ""}`}>
        {series.map((point, i) => (
          <div key={point.key} className="flex flex-col items-center gap-1">
            <div className="relative flex h-32 items-end gap-0.5 px-1.5">
              {SERIES_STYLE.map((s) => (
                <div
                  key={s.key}
                  className={`pointer-events-none w-2 rounded-t ${s.className}`}
                  style={{
                    height: `${Math.max(2, Math.round((Math.abs(point[s.key]) / maxValue) * 100))}%`,
                  }}
                />
              ))}
              {/* Faixa invisivel cobrindo toda a altura do grafico por dia
                  (nao so a largura fina das barras) - facilita acertar com o
                  mouse ou o dedo, especialmente em valores pequenos. Um
                  <button> da foco/toque/clique de graca, alem de hover. */}
              <button
                type="button"
                aria-label={buildAriaLabel(point, currency)}
                className="absolute -inset-x-1 inset-y-0 z-10 cursor-default touch-manipulation"
                onMouseEnter={(e) => show(i, e.currentTarget)}
                onMouseLeave={hide}
                onFocus={(e) => show(i, e.currentTarget)}
                onBlur={hide}
                onClick={(e) => (activeIndex === i ? hide() : show(i, e.currentTarget))}
              />
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

      <ChartTooltip anchor={anchor}>
        {activePoint && (
          <>
            <div className="font-semibold text-gray-900 dark:text-neutral-100">{activePoint.label}</div>
            <div className="mt-1 flex flex-col gap-0.5">
              {SERIES_STYLE.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${s.className}`} aria-hidden="true" />
                    {s.label}
                  </span>
                  <span className="font-medium text-gray-900 dark:text-neutral-100">
                    {formatMoney(activePoint[s.key], currency)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </ChartTooltip>
    </div>
  );
}
