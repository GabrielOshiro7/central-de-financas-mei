import { prisma } from "@/lib/db";
import { computeIndicatorSnapshot } from "@/lib/insights/snapshot";
import { evaluateSnapshot } from "@/lib/insights/rules";
import { enrichWithAI } from "@/lib/insights/narrative";

// Fingerprint barato de desatualizacao (aprovado explicitamente antes de
// codificar esta etapa): COUNT + MAX(updatedAt) de FinancialEntry no range
// informado, usando o indice ja existente [businessId, occurredAt] - nenhum
// indice novo necessario. O range cobre TANTO o periodo atual quanto o
// anterior recortado (comparisonPeriodStart ate periodEnd, um unico span
// continuo) - uma edicao retroativa no mes ja fechado tambem precisa
// invalidar o cache, nao so uma mudanca no mes corrente.
export async function computeDataFingerprint(
  businessId: string,
  range: { start: Date; end: Date }
): Promise<string> {
  const result = await prisma.financialEntry.aggregate({
    where: { businessId, occurredAt: { gte: range.start, lt: range.end } },
    _count: { _all: true },
    _max: { updatedAt: true },
  });
  const maxUpdatedAt = result._max.updatedAt?.getTime() ?? 0;
  return `${result._count._all}:${maxUpdatedAt}`;
}

// Unico ponto que efetivamente grava Insight. `withAI` so e true quando
// chamado pela rota de regenerar (POST /api/insights/regenerate) - o
// caminho de leitura (getInsightsForBusiness/GET) NUNCA passa withAI:true,
// entao nunca toca rede externa (decisao explicita da Etapa 7).
export async function generateInsightsForBusiness(
  businessId: string,
  now: Date,
  opts: { withAI: boolean }
): Promise<void> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { currency: true },
  });

  const snapshot = await computeIndicatorSnapshot(businessId, business.currency, now);
  const drafts = evaluateSnapshot(snapshot);
  const finalDrafts = opts.withAI ? await Promise.all(drafts.map((draft) => enrichWithAI(draft))) : drafts;

  const fingerprint = await computeDataFingerprint(businessId, {
    start: snapshot.comparisonPeriodStart,
    end: snapshot.periodEnd,
  });

  const activeMetrics = finalDrafts.map((d) => d.metric);

  // $transaction garante que "quais metricas existem para este periodo"
  // nunca fica inconsistente no meio do caminho: os upserts e o delete de
  // metricas que deixaram de disparar acontecem atomicamente.
  await prisma.$transaction(async (tx) => {
    for (const draft of finalDrafts) {
      await tx.insight.upsert({
        where: { businessId_periodKey_metric: { businessId, periodKey: snapshot.periodKey, metric: draft.metric } },
        create: {
          businessId,
          periodKey: snapshot.periodKey,
          category: draft.category,
          metric: draft.metric,
          priority: draft.priority,
          title: draft.title,
          description: draft.description,
          recommendation: draft.recommendation,
          periodStart: snapshot.periodStart,
          periodEnd: snapshot.periodEnd,
          comparisonPeriodStart: snapshot.comparisonPeriodStart,
          comparisonPeriodEnd: snapshot.comparisonPeriodEnd,
          currentValue: draft.currentValue,
          previousValue: draft.previousValue,
          variationAbsolute: draft.variationAbsolute,
          variationPercent: draft.variationPercent,
          variationKind: draft.variationKind,
          source: draft.source,
          narrativeSource: draft.narrativeSource,
          dataFingerprint: fingerprint,
        },
        update: {
          category: draft.category,
          priority: draft.priority,
          title: draft.title,
          description: draft.description,
          recommendation: draft.recommendation,
          periodStart: snapshot.periodStart,
          periodEnd: snapshot.periodEnd,
          comparisonPeriodStart: snapshot.comparisonPeriodStart,
          comparisonPeriodEnd: snapshot.comparisonPeriodEnd,
          currentValue: draft.currentValue,
          previousValue: draft.previousValue,
          variationAbsolute: draft.variationAbsolute,
          variationPercent: draft.variationPercent,
          variationKind: draft.variationKind,
          source: draft.source,
          narrativeSource: draft.narrativeSource,
          dataFingerprint: fingerprint,
          generatedAt: now,
        },
      });
    }

    // Remove qualquer Insight deste periodo cuja metrica nao esta mais entre
    // os drafts retornados (ex.: concentracao de clientes deixou de ser
    // relevante porque a base de clientes cresceu) - nenhuma linha
    // desatualizada fica para tras. notIn com lista vazia (nenhuma metrica
    // ativa) apaga tudo daquele periodo, o que e o comportamento correto.
    await tx.insight.deleteMany({
      where: { businessId, periodKey: snapshot.periodKey, metric: { notIn: activeMetrics } },
    });
  });
}
