export type MetricVariation = {
  text: string;
  direction: "up" | "down" | "flat";
  description?: string;
};

// Props novas (icon/tooltip/variation) sao todas opcionais - as chamadas
// existentes em /financeiro/page.tsx (so label+value) continuam funcionando
// sem alteracao.
export function MetricCard({
  label,
  value,
  icon,
  tooltip,
  variation,
}: {
  label: string;
  value: string | null;
  icon?: string;
  tooltip?: string;
  variation?: MetricVariation | null;
}) {
  const arrow = variation ? (variation.direction === "up" ? "↑" : variation.direction === "down" ? "↓" : "→") : null;
  const variationColor =
    variation?.direction === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : variation?.direction === "down"
        ? "text-rose-600 dark:text-rose-400"
        : "text-gray-500 dark:text-neutral-400";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-neutral-400">
        {icon && (
          <span aria-hidden="true">{icon}</span>
        )}
        <span>{label}</span>
        {tooltip && (
          <span
            className="cursor-help text-gray-400 dark:text-neutral-600"
            title={tooltip}
            aria-label={tooltip}
          >
            ⓘ
          </span>
        )}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          value ? "text-gray-900 dark:text-neutral-100" : "text-gray-400 dark:text-neutral-600"
        }`}
      >
        {value ?? "Sem dados"}
      </div>
      {variation && (
        <div className={`mt-1 flex flex-wrap items-center gap-1 text-xs font-medium ${variationColor}`}>
          {arrow && <span aria-hidden="true">{arrow}</span>}
          <span>{variation.text}</span>
          {variation.description && (
            <span className="font-normal text-gray-400 dark:text-neutral-500">{variation.description}</span>
          )}
        </div>
      )}
    </div>
  );
}
