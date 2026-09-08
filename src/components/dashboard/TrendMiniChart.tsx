import type { Currency } from "@prisma/client";
import { formatMoney } from "@/lib/money";

export type TrendPoint = { label: string; value: number };

// Grafico de linha simples (secoes 14/15/16 da Etapa 4: evolucao de
// lucro/faturamento) - SVG inline, sem lib nova (nao ha nenhuma no
// package.json e a Etapa 3 ja resolveu os graficos anteriores assim).
// viewBox proporcional (nao dimensao fixa em px) + preserveAspectRatio
// "none" + w-full: o SVG escala com o container, sem vazar horizontalmente
// no mobile. vectorEffect="non-scaling-stroke" mantem a espessura da linha
// visualmente constante apesar do viewBox nao ter proporcao 1:1.
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
  const comparePointsCoords = hasCompare ? coords(comparePoints!) : [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-neutral-100">
        <span>{title}</span>
        {tooltip && (
          <span className="cursor-help text-xs text-gray-400 dark:text-neutral-600" title={tooltip} aria-label={tooltip}>
            ⓘ
          </span>
        )}
      </div>

      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="mt-3 h-32 w-full"
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
          <circle key={`main-${i}`} cx={c.x} cy={c.y} r={1.6} fill="#10b981">
            <title>{`${c.point.label}: ${formatMoney(c.point.value, currency)}`}</title>
          </circle>
        ))}
        {comparePointsCoords.map((c, i) => (
          <circle key={`compare-${i}`} cx={c.x} cy={c.y} r={1.3} fill="#9ca3af">
            <title>{`${compareLabel ?? "Comparação"} — ${c.point.label}: ${formatMoney(c.point.value, currency)}`}</title>
          </circle>
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
    </div>
  );
}
