import { Prisma, type InsightMetric } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getPeriodKey, resolveInsightPeriods } from "@/lib/insights/snapshot";
import type { BusinessClock } from "@/lib/time/zoned";

// Estado de leitura dos insights POR USUARIO (tabela insight_reads: existir uma linha
// = lido).
//
// CHAVE DO INSIGHT: "<metrica em minusculas>:<periodo yyyy-mm>" (ex.:
// "expense_growth:2026-11"). Deterministica e estavel entre recalculos: a geracao
// (mutations.ts) grava no maximo UM insight por empresa + mes + metrica (upsert), entao
// recalcular com os mesmos fatos - ou com numeros diferentes (+150% -> +160%) - da a
// MESMA chave e mantem o estado de lido. Nao e o id da linha de insights, que muda
// quando uma metrica deixa de disparar e depois volta. Um insight de outro mes ou de
// outra metrica tem outra chave e entra como nao lido.
const METRICS = [
  "REVENUE_GROWTH",
  "MARGIN_CHANGE",
  "EXPENSE_GROWTH",
  "TICKET_AVERAGE_CHANGE",
  "RECEIVABLES_OVERDUE_CHANGE",
  "CLIENT_CONCENTRATION",
  "CLIENT_INACTIVITY",
] as const satisfies readonly InsightMetric[];

export function insightKey(metric: InsightMetric, periodKey: string): string {
  return `${metric.toLowerCase()}:${periodKey}`;
}

export const INSIGHT_KEY_REGEX = /^[a-z_]+:\d{4}-(0[1-9]|1[0-2])$/;

export function parseInsightKey(key: string): { metric: InsightMetric; periodKey: string } | null {
  if (!INSIGHT_KEY_REGEX.test(key)) return null;
  const [metricPart, periodKey] = key.split(":");
  const metric = METRICS.find((m) => m.toLowerCase() === metricPart);
  return metric ? { metric, periodKey } : null;
}

// Chaves (do usuario nesta empresa) ja lidas, dentre as informadas.
export async function listReadKeys(userId: string, businessId: string, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await prisma.insightRead.findMany({
    where: { userId, businessId, insightKey: { in: keys } },
    select: { insightKey: true },
  });
  return new Set(rows.map((r) => r.insightKey));
}

export type SetReadResult = { ok: true } | { ok: false; error: string };

// Marca/desmarca como lido. Idempotente. So aceita chave de um insight que EXISTE na
// empresa do usuario (nada de linhas soltas para chaves inventadas).
export async function setInsightRead(userId: string, businessId: string, key: string, read: boolean): Promise<SetReadResult> {
  const parsed = parseInsightKey(key);
  if (!parsed) return { ok: false, error: "Insight inválido." };

  const insight = await prisma.insight.findUnique({
    where: { businessId_periodKey_metric: { businessId, periodKey: parsed.periodKey, metric: parsed.metric } },
    select: { id: true },
  });
  if (!insight) return { ok: false, error: "Insight não encontrado." };

  if (read) {
    await prisma.insightRead.upsert({
      where: { userId_businessId_insightKey: { userId, businessId, insightKey: key } },
      create: { userId, businessId, insightKey: key },
      update: {},
    });
  } else {
    await prisma.insightRead.deleteMany({ where: { userId, businessId, insightKey: key } });
  }
  return { ok: true };
}

// Quantos insights do conjunto ATUAL (mes corrente da empresa) o usuario ainda nao
// leu. UMA contagem no banco (anti-join), sem gerar nem ler os insights; considera
// os insights ja gerados (a pagina Insights e o Dashboard geram/atualizam o conjunto).
export async function countUnreadInsights(userId: string, businessId: string, clock: BusinessClock): Promise<number> {
  const periodKey = getPeriodKey(resolveInsightPeriods(clock).current.start, clock.timeZone);
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*) AS count
    FROM insights i
    WHERE i.business_id = ${businessId}
      AND i.period_key = ${periodKey}
      AND NOT EXISTS (
        SELECT 1 FROM insight_reads r
        WHERE r.user_id = ${userId}
          AND r.business_id = i.business_id
          AND r.insight_key = lower(i.metric::text) || ':' || i.period_key
      )
  `);
  return Number(rows[0]?.count ?? 0);
}
