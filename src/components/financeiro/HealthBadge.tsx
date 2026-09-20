import { Circle } from "lucide-react";
import { HEALTH_ICON_COLOR, HEALTH_LABELS, type FinancialHealth } from "@/lib/finance/insights";

export function HealthBadge({ health }: { health: FinancialHealth }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {/* Único ícone preenchido do app, de propósito: é um farolzinho de
          status (bom/atenção/crítico), não um ícone de conteúdo - um
          círculo vazado perderia o significado de "luz acesa". */}
      <Circle
        size={24}
        strokeWidth={1.75}
        fill="currentColor"
        className={HEALTH_ICON_COLOR[health]}
        aria-hidden="true"
      />
      <div>
        <div className="text-xs text-gray-500 dark:text-neutral-400">Saúde financeira</div>
        <div className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{HEALTH_LABELS[health]}</div>
      </div>
    </div>
  );
}
