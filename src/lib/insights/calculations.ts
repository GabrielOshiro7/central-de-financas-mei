import type { Prisma } from "@prisma/client";

type Decimal = Prisma.Decimal;

// Único helper de fato novo desta etapa: toda a matemática de variação em si
// (percentual relativo, diferença em pontos percentuais) já existe em
// src/lib/finance/calculations.ts (calculateVariationPercent,
// marginPointsDelta) e é reaproveitada sem reimplementação - nunca duplicar
// esse cálculo aqui (requisito explícito da Etapa 7).
export function isVariationRelevant(variationValue: Decimal | null, thresholdAbs: number): boolean {
  if (variationValue === null) return false;
  return variationValue.abs().greaterThanOrEqualTo(thresholdAbs);
}
