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
