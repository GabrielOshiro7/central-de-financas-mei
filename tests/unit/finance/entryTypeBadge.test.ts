import { describe, it, expect } from "vitest";
import type { FinancialEntryType } from "@prisma/client";
import { ENTRY_TYPE_BADGE_STYLE, ENTRY_TYPE_LABELS } from "@/lib/finance/options";
import { expectNoBrandStatusColor, expectOnlyNeutralColors } from "../helpers/brandStatusPalette";

const ALL_TYPES: FinancialEntryType[] = ["REVENUE", "COST", "EXPENSE"];

// Tipo de lançamento (Receita/Custo/Despesa) não é um dos 4 usos da paleta
// Musgo/Âmbar/Terracota - com verde/âmbar/rosa, os tipos liam como
// "bom/atenção/crítico".
describe("entry type badge - selo neutro, diferenciado por texto/borda", () => {
  it("todo tipo tem selo e rótulo", () => {
    for (const type of ALL_TYPES) {
      expect(ENTRY_TYPE_BADGE_STYLE[type]).toBeTruthy();
      expect(ENTRY_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("nenhum selo usa Musgo/Âmbar/Terracota (nem tons claros/escuros equivalentes)", () => {
    for (const type of ALL_TYPES) expectNoBrandStatusColor(ENTRY_TYPE_BADGE_STYLE[type]);
  });

  it("todos os selos usam apenas tons neutros (gray/neutral)", () => {
    for (const type of ALL_TYPES) expectOnlyNeutralColors(ENTRY_TYPE_BADGE_STYLE[type]);
  });

  it("cada tipo tem um visual distinto (não reaproveita a mesma classe pra dois tipos)", () => {
    const styles = ALL_TYPES.map((type) => ENTRY_TYPE_BADGE_STYLE[type]);
    expect(new Set(styles).size).toBe(ALL_TYPES.length);
  });
});
