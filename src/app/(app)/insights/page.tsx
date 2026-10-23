import { requireOnboardedUser } from "@/lib/auth/guards";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import { InsightCard } from "@/components/insights/InsightCard";
import { RegenerateButton } from "@/components/insights/RegenerateButton";
import { clockFor } from "@/lib/time/zoned";

export default async function InsightsPage() {
  const { business } = await requireOnboardedUser();
  const insights = await getInsightsForBusiness(business.id, clockFor(business));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-neutral-100">Insights</h1>
        <RegenerateButton />
      </div>

      {insights.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
          <p>Ainda não há dados suficientes para gerar insights.</p>
        </div>
      ) : (
        // getInsightsForBusiness ja retorna ordenado por prioridade (CRITICAL
        // primeiro) e depois por categoria - a pagina so renderiza, nenhuma
        // logica de ordenacao aqui.
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}
