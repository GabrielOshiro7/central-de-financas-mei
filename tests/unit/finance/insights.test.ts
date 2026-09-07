import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { summarizeEntries, type FinancialEntryLike } from "@/lib/finance/calculations";
import {
  generateAlerts,
  computeFinancialHealth,
  EXPENSE_INCREASE_ALERT_THRESHOLD_PERCENT,
  MARGIN_DROP_THRESHOLD_POINTS,
  PROFIT_DROP_ALERT_THRESHOLD_PERCENT,
  CATEGORY_SHARE_ALERT_THRESHOLD_PERCENT,
  HEALTHY_MARGIN_THRESHOLD_PERCENT,
} from "@/lib/finance/insights";

const { Decimal } = Prisma;

function summary(entries: FinancialEntryLike[]) {
  return summarizeEntries(entries);
}

function entry(type: FinancialEntryLike["type"], amount: number): FinancialEntryLike {
  return { type, amount: new Decimal(amount) };
}

describe("generateAlerts - limiares (secao 20)", () => {
  it(`dispara quando despesas aumentam exatamente ${EXPENSE_INCREASE_ALERT_THRESHOLD_PERCENT}%`, () => {
    const previous = summary([entry("REVENUE", 1000), entry("EXPENSE", 100)]);
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 110)]);
    const alerts = generateAlerts(current, previous, []);
    expect(alerts.some((a) => a.id === "expenses_increase")).toBe(true);
  });

  it("não dispara com aumento de despesas abaixo do limiar", () => {
    const previous = summary([entry("REVENUE", 1000), entry("EXPENSE", 100)]);
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 109)]);
    const alerts = generateAlerts(current, previous, []);
    expect(alerts.some((a) => a.id === "expenses_increase")).toBe(false);
  });

  it("dispara quando custos crescem mais que o faturamento", () => {
    const previous = summary([entry("REVENUE", 1000), entry("COST", 100)]);
    const current = summary([entry("REVENUE", 1020), entry("COST", 105)]); // +2% receita, +5% custo
    const alerts = generateAlerts(current, previous, []);
    expect(alerts.some((a) => a.id === "costs_outpacing_revenue")).toBe(true);
  });

  it("não dispara quando custos e faturamento crescem no mesmo ritmo", () => {
    const previous = summary([entry("REVENUE", 1000), entry("COST", 100)]);
    const current = summary([entry("REVENUE", 1100), entry("COST", 110)]); // +10% ambos
    const alerts = generateAlerts(current, previous, []);
    expect(alerts.some((a) => a.id === "costs_outpacing_revenue")).toBe(false);
  });

  it(`dispara quando a margem líquida cai exatamente ${MARGIN_DROP_THRESHOLD_POINTS} pontos`, () => {
    const previous = summary([entry("REVENUE", 1000), entry("EXPENSE", 160)]); // margem 84%... ajustar para caso simples
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 190)]);
    const alerts = generateAlerts(current, previous, []);
    // previous margin = (1000-160)/1000*100 = 84; current = (1000-190)/1000*100=81; delta=3
    expect(alerts.some((a) => a.id === "margin_drop")).toBe(true);
  });

  it("não dispara com queda de margem abaixo do limiar", () => {
    const previous = summary([entry("REVENUE", 1000), entry("EXPENSE", 160)]);
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 189)]); // delta = 2.9
    const alerts = generateAlerts(current, previous, []);
    expect(alerts.some((a) => a.id === "margin_drop")).toBe(false);
  });

  it(`dispara quando o lucro cai ${PROFIT_DROP_ALERT_THRESHOLD_PERCENT}% ou mais (a partir de lucro anterior positivo)`, () => {
    const previous = summary([entry("REVENUE", 1000), entry("EXPENSE", 900)]); // lucro 100
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 911)]); // lucro 89, queda 11%
    const alerts = generateAlerts(current, previous, []);
    expect(alerts.some((a) => a.id === "profit_drop")).toBe(true);
  });

  it("não avalia queda de lucro quando o período anterior não teve lucro positivo", () => {
    const previous = summary([entry("EXPENSE", 100)]); // lucro anterior negativo
    const current = summary([entry("EXPENSE", 500)]);
    const alerts = generateAlerts(current, previous, []);
    expect(alerts.some((a) => a.id === "profit_drop")).toBe(false);
  });

  it(`dispara quando uma categoria representa ${CATEGORY_SHARE_ALERT_THRESHOLD_PERCENT}% ou mais das despesas`, () => {
    const current = summary([entry("EXPENSE", 100)]);
    const breakdown = [
      { categoryId: "a", categoryName: "Aluguel", amount: new Decimal(40), percentage: new Decimal(40) },
      { categoryId: "b", categoryName: "Outras", amount: new Decimal(60), percentage: new Decimal(60) },
    ];
    const alerts = generateAlerts(current, null, breakdown);
    expect(alerts.some((a) => a.id === "concentrated_expense_category")).toBe(true);
  });

  it("sem período anterior, não gera alertas de comparação", () => {
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 900)]);
    const alerts = generateAlerts(current, null, []);
    expect(alerts.filter((a) => a.id !== "concentrated_expense_category")).toHaveLength(0);
  });
});

describe("computeFinancialHealth - limiares (secao 21)", () => {
  it("sem nenhum lançamento -> NO_DATA", () => {
    expect(computeFinancialHealth(summary([]), null)).toBe("NO_DATA");
  });

  it(`margem líquida exatamente ${HEALTHY_MARGIN_THRESHOLD_PERCENT}% com lucro positivo -> GOOD`, () => {
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 900)]); // margem 10%
    expect(computeFinancialHealth(current, null)).toBe("GOOD");
  });

  it("margem líquida logo abaixo do limiar -> WARNING", () => {
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 901)]); // margem 9.9%
    expect(computeFinancialHealth(current, null)).toBe("WARNING");
  });

  it("margem líquida negativa -> CRITICAL", () => {
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 1100)]);
    expect(computeFinancialHealth(current, null)).toBe("CRITICAL");
  });

  it("lucro negativo sem faturamento (margem null) -> CRITICAL", () => {
    const current = summary([entry("EXPENSE", 500)]);
    expect(computeFinancialHealth(current, null)).toBe("CRITICAL");
  });

  it(`queda de margem de exatamente ${MARGIN_DROP_THRESHOLD_POINTS} pontos rebaixa para WARNING mesmo com margem alta`, () => {
    const previous = summary([entry("REVENUE", 1000), entry("EXPENSE", 100)]); // margem 90%
    const current = summary([entry("REVENUE", 1000), entry("EXPENSE", 130)]); // margem 87%, queda 3pts
    expect(computeFinancialHealth(current, previous)).toBe("WARNING");
  });
});
