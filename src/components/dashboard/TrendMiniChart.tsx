"use client";

import { useState } from "react";
import { Prisma, type Currency } from "@prisma/client";
import { Info } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { describeSignedGrowth } from "@/lib/finance/calculations";
import { formatSignedGrowthText } from "@/lib/finance/insights";
import { ChartTooltip, computeTooltipAnchor, type TooltipAnchor } from "@/components/dashboard/ChartTooltip";

const { Decimal } = Prisma;

export type TrendPoint = { label: string; value: number };

// Grafico de linha simples (secoes 14/15/16 da Etapa 4: evolucao de
// lucro/faturamento) - SVG inline, sem lib nova (nao ha nenhuma no
// package.json e a Etapa 3 ja resolveu os graficos anteriores assim).
// viewBox proporcional (nao dimensao fixa em px) + preserveAspectRatio
// "none" + w-full: o SVG escala com o container, sem vazar horizontalmente
// no mobile. vectorEffect="non-scaling-stroke" mantem a espessura da linha
// visualmente constante apesar do viewBox nao ter proporcao 1:1.
//
// Como o viewBox usa preserveAspectRatio="none", as coordenadas SVG (0-100 x
// 0-40) sao esticadas 1:1 pro tamanho real do elemento renderizado - por
// isso getBoundingClientRect() de um <circle> devolve a posicao/tamanho reais
// em pixel na tela, sem precisar converter manualmente (mesma logica do
// FinancialChart, so que aqui o "botao" invisivel e um circulo maior em vez
// de um retangulo).
export function TrendMiniChart({
  title,
  tooltip,
  points,
  comparePoints,
  compareLabel,
  currency,
}: {
  title: string;
  tooltip?: string;
  points: TrendPoint[];
  comparePoints?: TrendPoint[] | null;
  compareLabel?: string;
  currency: Currency;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
        Sem dados suficientes para {title.toLowerCase()}.
      </div>
    );
  }

  const hasCompare = !!comparePoints && comparePoints.length > 0;
  const allValues = [...points.map((p) => p.value), ...(hasCompare ? comparePoints!.map((p) => p.value) : [])];
  const max = Math.max(0, ...allValues);
  const min = Math.min(0, ...allValues);
  const range = max - min || 1;

  const coords = (series: TrendPoint[]) =>
    series.map((p, i) => ({
      x: series.length === 1 ? 50 : (i / (series.length - 1)) * 100,
      y: 36 - ((p.value - min) / range) * 32,
      point: p,
    }));

  const toPath = (series: TrendPoint[]) =>
    coords(series)
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(" ");

  const zeroY = 36 - ((0 - min) / range) * 32;
  const mainPoints = coords(points);

  function show(index: number, el: Element) {
    setActiveIndex(index);
    setAnchor(computeTooltipAnchor(el.getBoundingClientRect()));
  }

  function hide() {
    setActiveIndex(null);
    setAnchor(null);
  }

  const activePoint = activeIndex !== null ? points[activeIndex] : null;
  const activeComparePoint =
    activeIndex !== null && hasCompare && comparePoints![activeIndex] ? comparePoints![activeIndex] : null;

  const variation =
    activePoint && activeComparePoint
      ? describeSignedGrowth(new Decimal(activePoint.value), new Decimal(activeComparePoint.value))
      : null;

  function ariaLabelFor(point: TrendPoint, index: number): string {
    const base = `${point.label}: ${formatMoney(point.value, currency)}`;
    if (!hasCompare || !comparePoints![index]) return base;
    const comparePoint = comparePoints![index];
    const growth = describeSignedGrowth(new Decimal(point.value), new Decimal(comparePoint.value));
    const growthText = formatSignedGrowthText(growth, currency);
    return `${base}. ${compareLabel ?? "Comparação"} (${comparePoint.label}): ${formatMoney(comparePoint.value, currency)}. Variação: ${growthText}`;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-neutral-100">
        <span>{title}</span>
        {tooltip && (
          <span
            className="inline-flex cursor-help text-gray-400 dark:text-neutral-600"
            title={tooltip}
            aria-label={tooltip}
          >
            <Info size={14} strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
      </div>

      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="mt-3 h-32 w-full overflow-visible"
        role="img"
        aria-label={`Gráfico de ${title.toLowerCase()}`}
      >
        <line
          x1="0"
          y1={zeroY}
          x2="100"
          y2={zeroY}
          stroke="currentColor"
          strokeWidth="0.3"
          className="text-gray-200 dark:text-neutral-800"
        />
        {hasCompare && (
          <path
            d={toPath(comparePoints!)}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1"
            strokeDasharray="2,2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path d={toPath(points)} fill="none" stroke="#10b981" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {mainPoints.map((c, i) => (
          <g key={`main-${i}`}>
            <circle cx={c.x} cy={c.y} r={1.6} fill="#10b981" className="pointer-events-none" />
            {/* Circulo maior e transparente por cima do ponto visual - area
                de toque/clique/hover maior que o marcador fino, igual ao
                pedido pro grafico de barras. */}
            <circle
              cx={c.x}
              cy={c.y}
              r={6}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={ariaLabelFor(c.point, i)}
              className="cursor-default touch-manipulation outline-none"
              onMouseEnter={(e) => show(i, e.currentTarget)}
              onMouseLeave={hide}
              onFocus={(e) => show(i, e.currentTarget)}
              onBlur={hide}
              onClick={(e) => (activeIndex === i ? hide() : show(i, e.currentTarget))}
            />
          </g>
        ))}
      </svg>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-neutral-400">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>

      {hasCompare && compareLabel && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400">
          <span className="h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" />
          {compareLabel}
        </div>
      )}

      <ChartTooltip anchor={anchor}>
        {activePoint && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500 dark:text-neutral-400">{activePoint.label}</span>
              <span className="font-semibold text-gray-900 dark:text-neutral-100">
                {formatMoney(activePoint.value, currency)}
              </span>
            </div>
            {activeComparePoint && (
              <>
                <div className="mt-1 flex items-center justify-between gap-3 text-gray-500 dark:text-neutral-400">
                  <span>
                    {compareLabel ?? "Comparação"} ({activeComparePoint.label})
                  </span>
                  <span className="font-medium text-gray-700 dark:text-neutral-300">
                    {formatMoney(activeComparePoint.value, currency)}
                  </span>
                </div>
                {variation && (
                  <div className="mt-1 border-t border-gray-100 pt-1 font-medium text-gray-900 dark:border-neutral-700 dark:text-neutral-100">
                    {formatSignedGrowthText(variation, currency)}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </ChartTooltip>
    </div>
  );
}
