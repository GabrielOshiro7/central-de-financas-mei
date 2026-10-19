import type { ReactNode } from "react";
import { Info } from "lucide-react";

export type MetricVariation = {
  text: string;
  direction: "up" | "down" | "flat";
  description?: string;
  // Para qual lado o movimento e bom pro negocio - decide a cor, nao a seta
  // (a seta segue sempre o numero). Default "up" (Faturamento, Lucro,
  // Margem); Custos e Despesas passam "down": subir ali e ruim.
  favorableDirection?: "up" | "down";
};

// Props novas (icon/tooltip/variation) sao todas opcionais - chamadas so
// com label+value (ex.: cards de Vendas e Contas) continuam funcionando.
// `icon` e ReactNode (icone lucide-react) desde a remocao dos emojis - antes
// era uma string de emoji renderizada direto.
export function MetricCard({
  label,
  value,
  icon,
  tooltip,
  variation,
}: {
  label: string;
  value: string | null;
  icon?: ReactNode;
  tooltip?: string;
  variation?: MetricVariation | null;
}) {
  const arrow = variation ? (variation.direction === "up" ? "↑" : variation.direction === "down" ? "↓" : "→") : null;
  const favorableDirection = variation?.favorableDirection ?? "up";
  const variationColor =
    !variation || variation.direction === "flat"
      ? "text-gray-500 dark:text-neutral-400"
      : variation.direction === favorableDirection
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-neutral-400">
        {icon && (
          <span className="inline-flex shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        <span>{label}</span>
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
