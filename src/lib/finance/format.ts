import { Prisma } from "@prisma/client";

type Decimal = Prisma.Decimal;

// Percentual simples (margens): "12.3%" ou "N/A" quando nao ha dado.
export function formatPercent(value: Decimal | number | null): string {
  if (value === null) return "N/A";
  const n = typeof value === "number" ? value : value.toNumber();
  return `${n.toFixed(1)}%`;
}

// Variacao com sinal explicito (indicadores da secao 16): "+12.4%" / "-8.2%" / "N/A".
export function formatVariation(value: Decimal | number | null): string {
  if (value === null) return "N/A";
  const n = typeof value === "number" ? value : value.toNumber();
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${n.toFixed(1)}%`;
}

// Diferenca em PONTOS percentuais entre duas margens (secao 22 da Etapa 4:
// "+2,4 p.p.", nunca "%") - para nao confundir com uma variacao percentual
// relativa (formatVariation, acima). Usa o mesmo valor que marginPointsDelta
// (calculations.ts) ja calcula.
export function formatPercentagePoints(value: Decimal | number | null): string {
  if (value === null) return "N/A";
  const n = typeof value === "number" ? value : value.toNumber();
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${n.toFixed(1)} p.p.`;
}

// "01/09/2026 — 30/09/2026" (secao 5 da Etapa 4, label de periodo no
// cabecalho do dashboard). `end` e sempre o limite EXCLUSIVO usado nas
// queries (ver period.ts) - subtrai 1ms pra exibir o ultimo dia realmente
// incluido no periodo, nao o dia seguinte.
export function formatDateRange(start: Date, end: Date): string {
  const inclusiveEnd = new Date(end.getTime() - 1);
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR");
  return `${fmt(start)} — ${fmt(inclusiveEnd)}`;
}
