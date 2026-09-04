import { describe, it, expect } from "vitest";
import { resolvePeriodRange } from "@/lib/finance/period";

describe("resolvePeriodRange", () => {
  const now = new Date(2026, 2, 15); // 15 de março de 2026

  it("THIS_MONTH cobre só o mês atual", () => {
    const { start, end, months } = resolvePeriodRange("THIS_MONTH", now);
    expect(start).toEqual(new Date(2026, 2, 1));
    expect(end).toEqual(new Date(2026, 3, 1));
    expect(months).toEqual([{ year: 2026, month: 2 }]);
  });

  it("LAST_MONTH cobre o mês anterior", () => {
    const { months } = resolvePeriodRange("LAST_MONTH", now);
    expect(months).toEqual([{ year: 2026, month: 1 }]);
  });

  it("LAST_3_MONTHS inclui o mês atual e os 2 anteriores", () => {
    const { months } = resolvePeriodRange("LAST_3_MONTHS", now);
    expect(months).toEqual([
      { year: 2026, month: 0 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it("LAST_6_MONTHS inclui 6 meses terminando no atual", () => {
    const { months } = resolvePeriodRange("LAST_6_MONTHS", now);
    expect(months.length).toBe(6);
    expect(months[months.length - 1]).toEqual({ year: 2026, month: 2 });
    expect(months[0]).toEqual({ year: 2025, month: 9 });
  });

  it("THIS_YEAR vai de janeiro até o mês atual", () => {
    const { months } = resolvePeriodRange("THIS_YEAR", now);
    expect(months.length).toBe(3);
    expect(months[0]).toEqual({ year: 2026, month: 0 });
    expect(months[2]).toEqual({ year: 2026, month: 2 });
  });
});
