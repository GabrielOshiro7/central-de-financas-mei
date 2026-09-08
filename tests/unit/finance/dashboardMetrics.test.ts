import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  describeSignedGrowth,
  calculateBreakEven,
  calculateAverageTicket,
  buildTopCategoriesRanking,
  summarizeEntries,
} from "@/lib/finance/calculations";
import { formatSignedGrowthText } from "@/lib/finance/insights";
import { formatMoney } from "@/lib/money";

const { Decimal } = Prisma;

describe("describeSignedGrowth", () => {
  it("sem base de comparação quando o valor anterior é zero", () => {
    expect(describeSignedGrowth(new Decimal(100), new Decimal(0))).toEqual({ kind: "no_base" });
  });

  it("crescimento normal quando os dois valores têm o mesmo sinal (positivo)", () => {
    const result = describeSignedGrowth(new Decimal(120), new Decimal(100));
    expect(result.kind).toBe("percent");
    if (result.kind === "percent") expect(result.value.toNumber()).toBe(20);
  });

  it("crescimento normal quando os dois valores têm o mesmo sinal (negativo)", () => {
    // -50 -> -80: variação -60% (o prejuízo piorou), sem troca de sinal
    const result = describeSignedGrowth(new Decimal(-80), new Decimal(-50));
    expect(result.kind).toBe("percent");
    if (result.kind === "percent") expect(result.value.toNumber()).toBe(-60);
  });

  it("troca de sinal: prejuízo -> lucro (ADENDO da Etapa 4)", () => {
    const previous = new Decimal(-500);
    const current = new Decimal(300);
    const result = describeSignedGrowth(current, previous);
    expect(result).toEqual({ kind: "sign_flip", fromNegative: true, previous, current });
    expect(formatSignedGrowthText(result, "BRL")).toBe(
      `Saiu de prejuízo de ${formatMoney(new Decimal(500), "BRL")} para lucro de ${formatMoney(current, "BRL")}`
    );
  });

  it("troca de sinal: lucro -> prejuízo", () => {
    const previous = new Decimal(400);
    const current = new Decimal(-200);
    const result = describeSignedGrowth(current, previous);
    expect(result).toEqual({ kind: "sign_flip", fromNegative: false, previous, current });
    expect(formatSignedGrowthText(result, "BRL")).toBe(
      `Saiu de lucro de ${formatMoney(previous, "BRL")} para prejuízo de ${formatMoney(new Decimal(200), "BRL")}`
    );
  });

  it("chegar exatamente em zero não é tratado como troca de sinal (usa variação percentual normal)", () => {
    const result = describeSignedGrowth(new Decimal(0), new Decimal(-500));
    expect(result.kind).toBe("percent");
  });
});

describe("calculateBreakEven", () => {
  it("calcula a receita de equilíbrio quando há margem de contribuição positiva", () => {
    // receita 1000, custos variáveis (COST) 400, despesas fixas (EXPENSE) 300
    const summary = summarizeEntries([
      { type: "REVENUE", amount: new Decimal(1000) },
      { type: "COST", amount: new Decimal(400) },
      { type: "EXPENSE", amount: new Decimal(300) },
    ]);
    const result = calculateBreakEven(summary);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.contributionMarginRatio.toNumber()).toBeCloseTo(0.6); // (1000-400)/1000
      expect(result.breakEvenRevenue.toNumber()).toBeCloseTo(500); // 300 / 0.6
    }
  });

  it("sem faturamento no período -> dados insuficientes", () => {
    const summary = summarizeEntries([{ type: "EXPENSE", amount: new Decimal(100) }]);
    const result = calculateBreakEven(summary);
    expect(result.status).toBe("insufficient");
  });

  it("custos variáveis (COST) >= receita -> margem de contribuição não positiva -> dados insuficientes", () => {
    const summary = summarizeEntries([
      { type: "REVENUE", amount: new Decimal(100) },
      { type: "COST", amount: new Decimal(150) },
    ]);
    const result = calculateBreakEven(summary);
    expect(result.status).toBe("insufficient");
  });
});

describe("calculateAverageTicket", () => {
  it("sempre indisponível hoje, porque não há contagem de vendas no schema", () => {
    const result = calculateAverageTicket(new Decimal(1000), null);
    expect(result.status).toBe("unavailable");
  });

  it("calcula corretamente se uma contagem de vendas for informada (arquitetura pronta para o futuro)", () => {
    const result = calculateAverageTicket(new Decimal(1000), 20);
    expect(result).toEqual({ status: "ok", amount: new Decimal(50) });
  });
});

describe("buildTopCategoriesRanking", () => {
  it("combina custos e despesas num único ranking, top N + Outros", () => {
    const entries = [
      { categoryId: "a", categoryName: "Funcionários", amount: new Decimal(800) },
      { categoryId: "b", categoryName: "Aluguel", amount: new Decimal(300) },
      { categoryId: "c", categoryName: "Mercadorias", amount: new Decimal(250) },
      { categoryId: "d", categoryName: "Marketing", amount: new Decimal(120) },
      { categoryId: "e", categoryName: "Energia", amount: new Decimal(80) },
      { categoryId: "f", categoryName: "Telefone", amount: new Decimal(30) },
      { categoryId: "g", categoryName: "Software", amount: new Decimal(20) },
    ];
    const ranking = buildTopCategoriesRanking(entries, 5);
    expect(ranking.entries).toHaveLength(5);
    expect(ranking.entries[0].categoryName).toBe("Funcionários");
    expect(ranking.otherAmount?.toNumber()).toBe(50); // Telefone(30) + Software(20)
    expect(ranking.otherPercentage?.toNumber()).toBeCloseTo((50 / 1600) * 100);
    expect(ranking.grandTotal.toNumber()).toBe(1600);
  });

  it("sem categorias além do limite, não gera 'Outros'", () => {
    const entries = [{ categoryId: "a", categoryName: "Aluguel", amount: new Decimal(100) }];
    const ranking = buildTopCategoriesRanking(entries, 5);
    expect(ranking.otherAmount).toBeNull();
    expect(ranking.otherPercentage).toBeNull();
  });

  it("lista vazia retorna ranking vazio, sem dividir por zero", () => {
    const ranking = buildTopCategoriesRanking([], 5);
    expect(ranking.entries).toEqual([]);
    expect(ranking.otherAmount).toBeNull();
    expect(ranking.grandTotal.toNumber()).toBe(0);
  });
});
