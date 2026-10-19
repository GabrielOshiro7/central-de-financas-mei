import { describe, it, expect } from "vitest";
import type { SaleStatus } from "@prisma/client";
import { SALE_STATUS_BADGE_STYLE, SALE_STATUS_LABELS } from "@/lib/sales/options";
import { expectNoBrandStatusColor, expectOnlyNeutralColors } from "../helpers/brandStatusPalette";

const ALL_STATUSES: SaleStatus[] = ["DRAFT", "CONFIRMED", "CANCELLED", "COMPLETED"];

// Status da venda (Rascunho/Confirmada/Concluída/Cancelada) não é um dos 4
// usos da paleta Musgo/Âmbar/Terracota - e aparece na mesma linha do selo de
// status de PAGAMENTO, que é. Com o mesmo Âmbar, "Confirmada" e "Parcialmente
// paga" ficavam indistinguíveis lado a lado.
describe("sale status badge - selo neutro, diferenciado por texto/borda", () => {
  it("todo status de venda tem selo e rótulo", () => {
    for (const status of ALL_STATUSES) {
      expect(SALE_STATUS_BADGE_STYLE[status]).toBeTruthy();
      expect(SALE_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("nenhum selo usa Musgo/Âmbar/Terracota (nem tons claros/escuros equivalentes)", () => {
    for (const status of ALL_STATUSES) expectNoBrandStatusColor(SALE_STATUS_BADGE_STYLE[status]);
  });

  it("todos os selos usam apenas tons neutros (gray/neutral)", () => {
    for (const status of ALL_STATUSES) expectOnlyNeutralColors(SALE_STATUS_BADGE_STYLE[status]);
  });

  it("cada status tem um visual distinto (não reaproveita a mesma classe pra dois status)", () => {
    const styles = ALL_STATUSES.map((status) => SALE_STATUS_BADGE_STYLE[status]);
    expect(new Set(styles).size).toBe(ALL_STATUSES.length);
  });
});
