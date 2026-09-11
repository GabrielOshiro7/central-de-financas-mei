import { prisma } from "@/lib/db";
import { resolveInsightPeriods, getPeriodKey } from "@/lib/insights/snapshot";
import { computeDataFingerprint, generateInsightsForBusiness } from "@/lib/insights/mutations";

// Unico ponto de entrada publico que a rota GET /api/insights chama. NUNCA
// passa withAI:true para generateInsightsForBusiness - o caminho de leitura
// jamais toca rede externa, mesmo quando precisa regenerar por causa de
// dado desatualizado (decisao explicita da Etapa 7: a chamada de IA so
// acontece atras do botao manual de regenerar).
export async function getInsightsForBusiness(businessId: string, now: Date = new Date()) {
  const { current, previousClipped } = resolveInsightPeriods(now);
  const periodKey = getPeriodKey(current.start);

  const [currentFingerprint, existing] = await Promise.all([
    computeDataFingerprint(businessId, { start: previousClipped.start, end: current.end }),
    prisma.insight.findMany({ where: { businessId, periodKey } }),
  ]);

  const isStale = existing.length === 0 || existing.some((i) => i.dataFingerprint !== currentFingerprint);

  if (isStale) {
    await generateInsightsForBusiness(businessId, now, { withAI: false });
    return prisma.insight.findMany({
      where: { businessId, periodKey },
      orderBy: [{ priority: "desc" }, { category: "asc" }],
    });
  }

  // "desc" aqui funciona porque InsightPriority foi declarado no schema na
  // ordem INFO < ATTENTION < CRITICAL (Postgres ordena enums pela ordem de
  // declaracao do tipo) - CRITICAL sempre vem primeiro.
  return [...existing].sort((a, b) => {
    const priorityOrder = { INFO: 0, ATTENTION: 1, CRITICAL: 2 } as const;
    return priorityOrder[b.priority] - priorityOrder[a.priority] || a.category.localeCompare(b.category);
  });
}
