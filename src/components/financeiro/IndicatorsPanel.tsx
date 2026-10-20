export type IndicatorItem = { label: string; value: string };

export function IndicatorsPanel({ items }: { items: IndicatorItem[] }) {
  return (
    <div className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Indicadores</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="text-xs text-gray-500 dark:text-neutral-400">{item.label}</div>
            <div className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-neutral-100">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
