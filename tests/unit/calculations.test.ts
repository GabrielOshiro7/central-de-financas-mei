import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { summarizeEntries } from "@/lib/finance/calculations";

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
  });
});
