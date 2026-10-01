import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  summarizeEntries,
  summarizeByCategory,
  calculateVariationPercent,
  marginPointsDelta,
} from "@/lib/finance/calculations";

const { Decimal } = Prisma;

describe("summarizeEntries", () => {
  it("calcula lucro bruto, lucro líquido e margem corretamente", () => {
    const summary = summarizeEntries([
      { type: "REVENUE", amount: new Decimal(1000) },
      { type: "COST", amount: new Decimal(400) },
      { type: "EXPENSE", amount: new Decimal(100) },
    ]);

    expect(summary.revenue.toString()).toBe("1000");
    expect(summary.costs.toString()).toBe("400");
    expect(summary.expenses.toString()).toBe("100");
    expect(summary.grossProfit.toString()).toBe("600");
    expect(summary.netProfit.toString()).toBe("500");
    expect(summary.netMargin?.toNumber()).toBe(50);
  });

  it("faturamento zero retorna margem null, sem dividir por zero", () => {
    const summary = summarizeEntries([{ type: "COST", amount: new Decimal(100) }]);

    expect(summary.revenue.toString()).toBe("0");
    expect(summary.netMargin).toBeNull();
  });

  it("sinaliza corretamente quais tipos de lançamento existem no período", () => {
    const summary = summarizeEntries([{ type: "COST", amount: new Decimal(50) }]);

    expect(summary.hasRevenueEntries).toBe(false);
    expect(summary.hasCostEntries).toBe(true);
    expect(summary.hasExpenseEntries).toBe(false);
    expect(summary.hasAnyEntries).toBe(true);
  });

  it("sem nenhum lançamento, hasAnyEntries é false", () => {
    const summary = summarizeEntries([]);
    expect(summary.hasAnyEntries).toBe(false);
    expect(summary.netMargin).toBeNull();
    expect(summary.grossMargin).toBeNull();
  });
});

describe("summarizeByCategory", () => {
  it("agrupa por categoria e calcula o percentual sobre o total", () => {
    const breakdown = summarizeByCategory([
      { categoryId: "a", categoryName: "Aluguel", amount: new Decimal(600) },
      { categoryId: "b", categoryName: "Marketing", amount: new Decimal(300) },
      { categoryId: "a", categoryName: "Aluguel", amount: new Decimal(100) },
    ]);

    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].categoryName).toBe("Aluguel");
    expect(breakdown[0].amount.toString()).toBe("700");
    expect(breakdown[0].percentage?.toNumber()).toBe(70);
    expect(breakdown[1].percentage?.toNumber()).toBe(30);
  });

  it("sem lançamentos, retorna lista vazia", () => {
    expect(summarizeByCategory([])).toEqual([]);
  });
});

describe("calculateVariationPercent", () => {
  it("calcula a variação percentual entre dois valores", () => {
    const variation = calculateVariationPercent(new Decimal(112.4), new Decimal(100));
    expect(variation?.toNumber()).toBeCloseTo(12.4);
  });

  it("retorna null quando o valor anterior é zero (sem base para comparar)", () => {
    expect(calculateVariationPercent(new Decimal(100), new Decimal(0))).toBeNull();
  });

  it("calcula queda (variação negativa)", () => {
    const variation = calculateVariationPercent(new Decimal(80), new Decimal(100));
    expect(variation?.toNumber()).toBe(-20);
  });

  it("retorna null quando a base é tão pequena que a variação passa de 999,99% (ilegível, e estouraria Insight.variationPercent)", () => {
    expect(calculateVariationPercent(new Decimal(1000), new Decimal(0.01))).toBeNull();
  });

  it("calcula normalmente uma variação logo abaixo do limite de legibilidade", () => {
    const variation = calculateVariationPercent(new Decimal(1099.9), new Decimal(100));
    expect(variation?.toNumber()).toBeCloseTo(999.9);
  });
});

describe("marginPointsDelta", () => {
  it("calcula a diferença em pontos percentuais entre duas margens", () => {
    const delta = marginPointsDelta(new Decimal(11), new Decimal(16));
    expect(delta?.toNumber()).toBe(-5);
  });

  it("retorna null quando qualquer uma das margens é null", () => {
    expect(marginPointsDelta(null, new Decimal(10))).toBeNull();
    expect(marginPointsDelta(new Decimal(10), null)).toBeNull();
  });
});
