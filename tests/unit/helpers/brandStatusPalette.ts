import { expect } from "vitest";

// Hexes/tons da paleta de status da marca (Musgo/Âmbar/Terracota) - ver
// PAYMENT_STATUS_BADGE_STYLE em src/components/vendas/SaleTable.tsx e
// STATUS_BADGE_STYLE em src/components/financeiro/BillTable.tsx. A paleta é
// reservada a 4 usos (KPI, selo de status de pagamento, selo de prioridade de
// insight, linha de gráfico); selos fora disso não podem usar nenhum destes
// valores, nem os tons claros/escuros equivalentes ("#a5690f" é o Âmbar
// antigo, de antes do ajuste de contraste) nem as famílias Tailwind
// parecidas.
export const FORBIDDEN_STATUS_COLOR_TOKENS = [
  "#3f6b4a",
  "#8a570c",
  "#a8402a",
  "#a5690f",
  "#E3EEE6",
  "#FBEDD9",
  "#FBE4DE",
  "#8FD4A0",
  "#F0B24A",
  "#F0917C",
  "#332510",
  "#1C2E21",
  "#33201B",
  "emerald",
  "amber",
  "rose",
];

export function expectNoBrandStatusColor(className: string) {
  const lower = className.toLowerCase();
  for (const token of FORBIDDEN_STATUS_COLOR_TOKENS) {
    expect(lower).not.toContain(token.toLowerCase());
  }
}

// Só permite classes de cor gray-*/neutral-* (texto, borda, fundo) - qualquer
// outra família Tailwind (amber-*, emerald-*, rose-*, blue-*...) indicaria uma
// cor de status vazando para um selo que deveria ser neutro.
export function expectOnlyNeutralColors(className: string) {
  const colorClassPattern = /\b(?:text|bg|border)-([a-z]+)-\d+/g;
  const matches = [...className.matchAll(colorClassPattern)];
  expect(matches.length).toBeGreaterThan(0);
  for (const match of matches) {
    expect(["gray", "neutral"]).toContain(match[1]);
  }
}
