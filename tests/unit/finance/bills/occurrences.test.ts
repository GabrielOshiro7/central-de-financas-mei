import { describe, it, expect } from "vitest";
import { generateBillOccurrences, type RecurringBillLike } from "@/lib/finance/bills/occurrences";
import { PROCESS_TZ } from "../../../helpers/processClock";
import { dateKeyToDbDate } from "@/lib/time/zoned";

// Inicio/fim do molde = os dias gravados em startOn/endOn (@db.Date, F6b-2).
const day = dateKeyToDbDate;

function entry(overrides: Partial<RecurringBillLike>): RecurringBillLike {
  return {
    frequency: "MONTHLY",
    dayOfWeek: null,
    dayOfMonth: null,
    yearMonth: null,
    startOn: day("2026-01-01"),
    endOn: null,
    ...overrides,
  };
}

describe("generateBillOccurrences - reaproveita recurring/occurrences.ts, so muda o step", () => {
  it("WEEKLY: step 1, mesmo espaçamento de 7 dias que RecurringEntry", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "WEEKLY", dayOfWeek: 1, startOn: day("2026-01-05") }),
      new Date(2026, 1, 2),
      PROCESS_TZ
    );
    expect(dates).toEqual(["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"]);
  });

  it("BIWEEKLY: pula uma ocorrência semanal a cada vez (espaçamento de 14 dias)", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "BIWEEKLY", dayOfWeek: 1, startOn: day("2026-01-05") }),
      new Date(2026, 1, 2),
      PROCESS_TZ
    );
    expect(dates).toEqual(["2026-01-05", "2026-01-19", "2026-02-02"]);
  });

  it("MONTHLY: step 1, uma ocorrência por mês", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "MONTHLY", dayOfMonth: 10, startOn: day("2026-01-01") }),
      new Date(2026, 3, 30),
      PROCESS_TZ
    );
    expect(dates).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
      "2026-04-10",
    ]);
  });

  it("QUARTERLY: pula 3 ocorrências mensais por vez (a cada 3 meses)", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "QUARTERLY", dayOfMonth: 10, startOn: day("2026-01-01") }),
      new Date(2026, 11, 31),
      PROCESS_TZ
    );
    expect(dates).toEqual(["2026-01-10", "2026-04-10", "2026-07-10", "2026-10-10"]);
  });

  it("SEMIANNUAL: pula 6 ocorrências mensais por vez (a cada 6 meses)", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "SEMIANNUAL", dayOfMonth: 10, startOn: day("2026-01-01") }),
      new Date(2027, 11, 31),
      PROCESS_TZ
    );
    expect(dates).toEqual(["2026-01-10", "2026-07-10", "2027-01-10", "2027-07-10"]);
  });

  it("YEARLY: step 1, uma ocorrência por ano", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "YEARLY", yearMonth: 5, dayOfMonth: 15, startOn: day("2026-01-01") }),
      new Date(2028, 11, 31),
      PROCESS_TZ
    );
    expect(dates).toEqual(["2026-06-15", "2027-06-15", "2028-06-15"]);
  });

  it("QUARTERLY: clamp de dayOfMonth 31 em meses menores continua funcionando (herdado de occurrences.ts)", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "QUARTERLY", dayOfMonth: 31, startOn: day("2026-01-01") }),
      new Date(2026, 6, 31),
      PROCESS_TZ
    );
    // jan(31), abr(30 - clamp), jul(31)
    expect(dates).toEqual(["2026-01-31", "2026-04-30", "2026-07-31"]);
  });

  it("respeita endOn (inclusive): para a partir da ocorrência seguinte a ela", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "MONTHLY", dayOfMonth: 1, startOn: day("2026-01-01"), endOn: day("2026-03-01") }),
      new Date(2026, 11, 31),
      PROCESS_TZ
    );
    expect(dates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("nunca gera além de uptoDate", () => {
    const dates = generateBillOccurrences(
      entry({ frequency: "MONTHLY", dayOfMonth: 1, startOn: day("2026-01-01") }),
      new Date(2026, 2, 15),
      PROCESS_TZ
    );
    expect(dates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});
