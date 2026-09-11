import Link from "next/link";
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

const PRIORITY_BADGE_STYLE: Record<InsightPriority, string> = {
  CRITICAL: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  ATTENTION: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  INFO: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
};

// Aponta sempre para telas ja existentes e filtradas (secao 23 do prompt da
// Etapa 7) - nunca uma pagina de detalhe duplicada so para insights.
function actionLinkFor(metric: InsightMetric): { href: string; label: string } | null {
  switch (metric) {
    case "REVENUE_GROWTH":
    case "MARGIN_CHANGE":
    case "EXPENSE_GROWTH":
      return { href: "/financeiro", label: "Ver financeiro" };
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
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
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
        <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-neutral-800/60 dark:text-neutral-400">
          💡 {insight.recommendation}
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
