import Link from "next/link";
import { InsightCard, type InsightCardData } from "@/components/insights/InsightCard";

// Top 3 insights por prioridade (Etapa 7), renderizado ao lado de
// CommercialPanel/BillsForecastPanel. Somente leitura, aditivo - le
// getInsightsForBusiness (a mesma funcao da pagina /insights), NUNCA chama
// IA (o dashboard jamais bloqueia por causa de uma chamada externa).
export function InsightsSummaryPanel({ insights }: { insights: InsightCardData[] }) {
  if (insights.length === 0) return null;
  const top3 = insights.slice(0, 3);

  return (
    <div className="border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Insights</h2>
        <Link href="/insights" className="text-xs font-medium text-gray-500 hover:underline dark:text-neutral-400">
          Ver todos →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {top3.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
