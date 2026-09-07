import { describe, it, expect } from "vitest";
import { resolvePeriodRange, getPreviousPeriodRange, parseCustomRangeParams } from "@/lib/finance/period";

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

  it("CUSTOM cobre exatamente o intervalo escolhido (fim inclusivo)", () => {
    const { start, end, months } = resolvePeriodRange("CUSTOM", now, {
      start: new Date(2026, 1, 20),
      end: new Date(2026, 2, 5),
    });
    expect(start).toEqual(new Date(2026, 1, 20));
    expect(end).toEqual(new Date(2026, 2, 6)); // exclusivo: dia seguinte ao fim escolhido
    expect(months).toEqual([
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it("CUSTOM sem customRange lança erro (uso indevido da API)", () => {
    expect(() => resolvePeriodRange("CUSTOM", now)).toThrow();
  });
});

describe("getPreviousPeriodRange", () => {
  it("THIS_MONTH -> período anterior é o mês anterior", () => {
    const now = new Date(2026, 2, 15);
    const current = resolvePeriodRange("THIS_MONTH", now);
    const previous = getPreviousPeriodRange(current);
    expect(previous).toEqual({ start: new Date(2026, 1, 1), end: new Date(2026, 2, 1) });
  });

  it("um período custom de 15 dias -> anterior são os 15 dias imediatamente antes", () => {
    // start no dia 16 (nao dia 1) faz cair no ramo generico por duracao, nao
    // no ramo alinhado a mes - exatamente o caso de um range personalizado.
    const current = { start: new Date(2026, 2, 16), end: new Date(2026, 2, 31), months: [] };
    const previous = getPreviousPeriodRange(current);
    expect(previous).toEqual({ start: new Date(2026, 2, 1), end: new Date(2026, 2, 16) });
  });
});

describe("parseCustomRangeParams", () => {
  it("aceita duas datas válidas em ordem", () => {
    const range = parseCustomRangeParams("2026-01-01", "2026-01-31");
    expect(range).toEqual({ start: new Date(2026, 0, 1), end: new Date(2026, 0, 31) });
  });

  it("retorna undefined quando falta uma data", () => {
    expect(parseCustomRangeParams("2026-01-01", null)).toBeUndefined();
    expect(parseCustomRangeParams(null, "2026-01-31")).toBeUndefined();
  });

  it("retorna undefined quando o início vem depois do fim", () => {
    expect(parseCustomRangeParams("2026-02-01", "2026-01-01")).toBeUndefined();
  });
});
