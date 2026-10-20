import Link from "next/link";
import { Lightbulb } from "lucide-react";
import type { InsightCategory, InsightMetric, InsightPriority } from "@prisma/client";
import { INSIGHT_CATEGORY_LABELS, INSIGHT_PRIORITY_LABELS } from "@/lib/insights/options";

export type InsightCardData = {
  id: string;
  category: InsightCategory;
  metric: InsightMetric;
  priority: InsightPriority;
  title: string;
  description: string;
  recommendation: string | null;
};

// Musgo/Âmbar/Terracota: paleta de status do app. INFO fica fora do trio -
// é informativo, não um alerta de atenção/crítico, então mantém o azul.
const PRIORITY_BADGE_STYLE: Record<InsightPriority, string> = {
  CRITICAL: "bg-[#FBE4DE] text-[#a8402a] dark:bg-[#33201B] dark:text-[#F0917C]",
  ATTENTION: "bg-[#FBEDD9] text-[#8a570c] dark:bg-[#332510] dark:text-[#F0B24A]",
  INFO: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

// Aponta sempre para telas ja existentes e filtradas (secao 23 do prompt da
// Etapa 7) - nunca uma pagina de detalhe duplicada so para insights.
function actionLinkFor(metric: InsightMetric): { href: string; label: string } | null {
  switch (metric) {
    case "REVENUE_GROWTH":
      return { href: "/financeiro/receitas", label: "Ver receitas" };
    case "EXPENSE_GROWTH":
      return { href: "/financeiro/despesas", label: "Ver despesas" };
    // Margem nao aparece em nenhuma aba do Financeiro - so nos cards do
    // Dashboard.
    case "MARGIN_CHANGE":
      return { href: "/dashboard", label: "Ver margens no dashboard" };
    case "TICKET_AVERAGE_CHANGE":
      return { href: "/vendas", label: "Ver vendas" };
    case "RECEIVABLES_OVERDUE_CHANGE":
      return { href: "/financeiro/receber?status=OVERDUE", label: "Ver contas vencidas" };
    case "CLIENT_CONCENTRATION":
    case "CLIENT_INACTIVITY":
      return { href: "/clientes", label: "Ver clientes" };
    default: {
      const exhaustiveCheck: never = metric;
      throw new Error(`Métrica não tratada: ${exhaustiveCheck}`);
    }
  }
}

export function InsightCard({ insight }: { insight: InsightCardData }) {
  const action = actionLinkFor(insight.metric);

  return (
    <div className="flex flex-col gap-3 border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE_STYLE[insight.priority]}`}>
          {INSIGHT_PRIORITY_LABELS[insight.priority]}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
          {INSIGHT_CATEGORY_LABELS[insight.category]}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{insight.title}</h3>
      <p className="text-sm text-gray-600 dark:text-neutral-400">{insight.description}</p>

      {insight.recommendation && (
        <p className="flex items-start gap-1.5 bg-gray-50 p-3 text-xs text-gray-600 dark:bg-neutral-800/60 dark:text-neutral-400">
          <Lightbulb size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{insight.recommendation}</span>
        </p>
      )}

      {action && (
        <Link href={action.href} className="text-xs font-medium text-gray-700 hover:underline dark:text-neutral-300">
          {action.label} →
        </Link>
      )}
    </div>
  );
}
