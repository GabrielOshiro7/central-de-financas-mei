import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { calculateAccumulatedBalance, type CashEntryLike } from "@/lib/finance/cash/calculations";

const { Decimal } = Prisma;

// Etapa F6a-2: o caixa compara DIAS de calendario (occurredOn) com o dia do
// saldo inicial - os mesmos dias de antes, agora como DateKey.
function entry(type: "REVENUE" | "COST" | "EXPENSE", amount: number, occurredOn: string): CashEntryLike {
  return { type, amount: new Decimal(amount), occurredOn };
}

describe("calculateAccumulatedBalance - APROXIMACAO baseada em lancamentos, nunca o saldo bancario real", () => {
  it("soma o netProfit dos lancamentos posteriores ao saldo inicial", () => {
    const openingBalanceDate = "2026-01-01";
    const entries = [
      entry("REVENUE", 1000, "2026-01-05"),
      entry("COST", 200, "2026-01-10"),
      entry("EXPENSE", 100, "2026-01-15"),
    ];
    // netProfit = 1000 - 200 - 100 = 700; saldo = 500 (inicial) + 700 = 1200
    const balance = calculateAccumulatedBalance(new Decimal(500), openingBalanceDate, entries);
    expect(balance.toNumber()).toBe(1200);
  });

  it("lançamentos ANTES da data do saldo inicial são excluídos (já embutidos no valor inicial)", () => {
    const openingBalanceDate = "2026-01-10";
    const entries = [
      entry("REVENUE", 5000, "2026-01-05"), // antes - excluido
      entry("REVENUE", 300, "2026-01-15"), // depois - contado
    ];
    const balance = calculateAccumulatedBalance(new Decimal(1000), openingBalanceDate, entries);
    expect(balance.toNumber()).toBe(1300); // 1000 + 300, NUNCA 1000 + 5000 + 300
  });

  it("lançamento EXATAMENTE na data do saldo inicial é excluído (estritamente posterior, não >=)", () => {
    const openingBalanceDate = "2026-01-10";
    const entries = [
      entry("REVENUE", 999, "2026-01-10"), // mesma data - excluido
      entry("REVENUE", 50, "2026-01-11"), // dia seguinte - contado
    ];
    const balance = calculateAccumulatedBalance(new Decimal(0), openingBalanceDate, entries);
    expect(balance.toNumber()).toBe(50);
  });

  it("sem nenhum lançamento qualificado, o saldo é exatamente o saldo inicial", () => {
    const balance = calculateAccumulatedBalance(new Decimal(750), "2026-01-01", []);
    expect(balance.toNumber()).toBe(750);
  });

  it("saldo inicial negativo é suportado (empresa que começou endividada)", () => {
    const entries = [entry("REVENUE", 300, "2026-01-05")];
    const balance = calculateAccumulatedBalance(new Decimal(-1000), "2026-01-01", entries);
    expect(balance.toNumber()).toBe(-700);
  });

  it("precisão decimal preservada (nunca float) em somas com centavos", () => {
    const entries = [
      entry("REVENUE", 10.1, "2026-01-05"),
      entry("EXPENSE", 0.2, "2026-01-06"),
    ];
    // 10.1 - 0.2 = 9.9 exato - um float ingenuo (0.1+0.2 style) erraria aqui.
    const balance = calculateAccumulatedBalance(new Decimal(0), "2026-01-01", entries);
    expect(balance.toString()).toBe("9.9");
  });
});
