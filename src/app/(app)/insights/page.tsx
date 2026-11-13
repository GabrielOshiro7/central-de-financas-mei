import { requireOnboardedUser } from "@/lib/auth/guards";
import { getInsightsForBusiness } from "@/lib/insights/queries";
import { insightKey, listReadKeys } from "@/lib/insights/reads";
import { InsightCard } from "@/components/insights/InsightCard";
import { RegenerateButton } from "@/components/insights/RegenerateButton";
import { clockFor } from "@/lib/time/zoned";

export default async function InsightsPage() {
  const { user, business } = await requireOnboardedUser();
  const insights = await getInsightsForBusiness(business.id, clockFor(business));
  // Estado lido/nao lido DESTE usuario (chave estavel: metrica + mes).
  const keyOf = (insight: (typeof insights)[number]) => insightKey(insight.metric, insight.periodKey);
  const readKeys = await listReadKeys(user.id, business.id, insights.map(keyOf));

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
            <InsightCard key={insight.id} insight={insight} readState={{ key: keyOf(insight), read: readKeys.has(keyOf(insight)) }} />
          ))}
        </div>
      )}
    </div>
  );
}
