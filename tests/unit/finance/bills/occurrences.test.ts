import { describe, it, expect } from "vitest";
import { generateBillOccurrences, type RecurringBillLike } from "@/lib/finance/bills/occurrences";

function entry(overrides: Partial<RecurringBillLike>): RecurringBillLike {
  return {
    frequency: "MONTHLY",
    dayOfWeek: null,
    dayOfMonth: null,
    yearMonth: null,
    startDate: new Date(2026, 0, 1),
    endDate: null,
    ...overrides,
  };
}

describe("generateBillOccurrences - reaproveita recurring/occurrences.ts, so muda o step", () => {
  it("WEEKLY: step 1, mesmo espaçamento de 7 dias que RecurringEntry", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "WEEKLY", dayOfWeek: 1, startDate: new Date(2026, 0, 5) }),
      new Date(2026, 1, 2)
    );
    expect(dates).toEqual([new Date(2026, 0, 5), new Date(2026, 0, 12), new Date(2026, 0, 19), new Date(2026, 0, 26), new Date(2026, 1, 2)]);
  });

  it("BIWEEKLY: pula uma ocorrência semanal a cada vez (espaçamento de 14 dias)", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "BIWEEKLY", dayOfWeek: 1, startDate: new Date(2026, 0, 5) }),
      new Date(2026, 1, 2)
    );
    expect(dates).toEqual([new Date(2026, 0, 5), new Date(2026, 0, 19), new Date(2026, 1, 2)]);
  });

  it("MONTHLY: step 1, uma ocorrência por mês", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "MONTHLY", dayOfMonth: 10, startDate: new Date(2026, 0, 1) }),
      new Date(2026, 3, 30)
    );
    expect(dates).toEqual([
      new Date(2026, 0, 10),
      new Date(2026, 1, 10),
      new Date(2026, 2, 10),
      new Date(2026, 3, 10),
    ]);
  });

  it("QUARTERLY: pula 3 ocorrências mensais por vez (a cada 3 meses)", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "QUARTERLY", dayOfMonth: 10, startDate: new Date(2026, 0, 1) }),
      new Date(2026, 11, 31)
    );
    expect(dates).toEqual([new Date(2026, 0, 10), new Date(2026, 3, 10), new Date(2026, 6, 10), new Date(2026, 9, 10)]);
  });

  it("SEMIANNUAL: pula 6 ocorrências mensais por vez (a cada 6 meses)", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "SEMIANNUAL", dayOfMonth: 10, startDate: new Date(2026, 0, 1) }),
      new Date(2027, 11, 31)
    );
    expect(dates).toEqual([new Date(2026, 0, 10), new Date(2026, 6, 10), new Date(2027, 0, 10), new Date(2027, 6, 10)]);
  });

  it("YEARLY: step 1, uma ocorrência por ano", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "YEARLY", yearMonth: 5, dayOfMonth: 15, startDate: new Date(2026, 0, 1) }),
      new Date(2028, 11, 31)
    );
    expect(dates).toEqual([new Date(2026, 5, 15), new Date(2027, 5, 15), new Date(2028, 5, 15)]);
  });

  it("QUARTERLY: clamp de dayOfMonth 31 em meses menores continua funcionando (herdado de occurrences.ts)", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "QUARTERLY", dayOfMonth: 31, startDate: new Date(2026, 0, 1) }),
      new Date(2026, 6, 31)
    );
    // jan(31), abr(30 - clamp), jul(31)
    expect(dates).toEqual([new Date(2026, 0, 31), new Date(2026, 3, 30), new Date(2026, 6, 31)]);
  });

  it("respeita endDate (inclusive): para a partir da ocorrência seguinte a ela", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "MONTHLY", dayOfMonth: 1, startDate: new Date(2026, 0, 1), endDate: new Date(2026, 2, 1) }),
      new Date(2026, 11, 31)
    );
    expect(dates).toEqual([new Date(2026, 0, 1), new Date(2026, 1, 1), new Date(2026, 2, 1)]);
  });

  it("nunca gera além de uptoDate", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "MONTHLY", dayOfMonth: 1, startDate: new Date(2026, 0, 1) }),
      new Date(2026, 2, 15)
    );
    expect(dates).toEqual([new Date(2026, 0, 1), new Date(2026, 1, 1), new Date(2026, 2, 1)]);
  });
});
