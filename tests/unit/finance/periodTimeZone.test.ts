import { describe, it, expect } from "vitest";
import {
  getPreviousPeriodRange,
  monthsBetween,
  parseCustomRangeParams,
  resolveComparisonRange,
  resolvePeriodRange,
} from "@/lib/finance/period";
import { clipToSameDayOfMonth, getPeriodKey, resolveInsightPeriods } from "@/lib/insights/snapshot";

// Etapa F3a: periodos no FUSO DA EMPRESA, independente do fuso do processo.
// Todos os instantes sao UTC explicito (sufixo Z) e o fuso da empresa e
// sempre passado - estes testes dao o mesmo resultado com o processo em UTC,
// Asia/Tokyo ou America/New_York (matriz da F3a).
const iso = (d: Date) => d.toISOString();
const clock = (nowIso: string, timeZone: string) => ({ now: new Date(nowIso), timeZone });

describe("empresa Asia/Tokyo (qualquer fuso de processo)", () => {
  const TZ = "Asia/Tokyo";

  it("00:00–09:00 JST: 'hoje' e 'este mês' são os de Tóquio, mesmo com o dia UTC ainda no anterior", () => {
    const c = clock("2026-10-22T20:00:00Z", TZ); // 05:00 de 23/10 em Tóquio; 22/10 em UTC
    const today = resolvePeriodRange("TODAY", c);
    expect(iso(today.start)).toBe("2026-10-22T15:00:00.000Z"); // 23/10 00:00 JST
    expect(iso(today.end)).toBe("2026-10-23T15:00:00.000Z");
    expect(today.timeZone).toBe(TZ);
  });

  it("virada de mês às 00:00 JST de 01/11 (ainda 31/10 em UTC): 'este mês' já é novembro", () => {
    const c = clock("2026-10-31T16:00:00Z", TZ); // 01:00 de 01/11 em Tóquio
    const month = resolvePeriodRange("THIS_MONTH", c);
    expect(iso(month.start)).toBe("2026-10-31T15:00:00.000Z");
    expect(iso(month.end)).toBe("2026-11-30T15:00:00.000Z");
    expect(month.months).toEqual([{ year: 2026, month: 10 }]);

    const previous = getPreviousPeriodRange(month);
    expect(iso(previous.start)).toBe("2026-09-30T15:00:00.000Z"); // 01/10 00:00 JST
    expect(iso(previous.end)).toBe("2026-10-31T15:00:00.000Z");
  });

  it("23:59:59.999 JST ainda é o dia; 00:00 JST já é o seguinte", () => {
    const before = resolvePeriodRange("TODAY", clock("2026-10-22T14:59:59.999Z", TZ));
    const after = resolvePeriodRange("TODAY", clock("2026-10-22T15:00:00.000Z", TZ));
    expect(iso(before.start)).toBe("2026-10-21T15:00:00.000Z");
    expect(iso(after.start)).toBe("2026-10-22T15:00:00.000Z");
  });

  it("virada de ano: THIS_YEAR / LAST_YEAR às 00:30 JST de 01/01/2027", () => {
    const c = clock("2026-12-31T15:30:00Z", TZ);
    const thisYear = resolvePeriodRange("THIS_YEAR", c);
    expect(iso(thisYear.start)).toBe("2026-12-31T15:00:00.000Z");
    expect(thisYear.months).toEqual([{ year: 2027, month: 0 }]);
    const lastYear = resolvePeriodRange("LAST_YEAR", c);
    expect(iso(lastYear.start)).toBe("2025-12-31T15:00:00.000Z");
    expect(iso(lastYear.end)).toBe("2026-12-31T15:00:00.000Z");
  });

  it("LAST_7_DAYS e CUSTOM (fim inclusivo) em dias de Tóquio", () => {
    const last7 = resolvePeriodRange("LAST_7_DAYS", clock("2026-10-22T20:00:00Z", TZ)); // hoje = 23/10
    expect(iso(last7.start)).toBe("2026-10-16T15:00:00.000Z"); // 17/10
    expect(iso(last7.end)).toBe("2026-10-23T15:00:00.000Z"); // 24/10 (exclusivo)

    const custom = resolvePeriodRange("CUSTOM", clock("2026-10-22T20:00:00Z", TZ), { start: "2026-02-20", end: "2026-03-05" });
    expect(iso(custom.start)).toBe("2026-02-19T15:00:00.000Z");
    expect(iso(custom.end)).toBe("2026-03-05T15:00:00.000Z"); // 06/03 00:00 JST
    expect(custom.months).toEqual([
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it("SAME_PERIOD_LAST_YEAR: mês e dia (29/02 normaliza para 01/03)", () => {
    const month = resolvePeriodRange("THIS_MONTH", clock("2026-03-15T03:00:00Z", TZ));
    expect(resolveComparisonRange("SAME_PERIOD_LAST_YEAR", month)).toEqual({
      start: new Date("2025-02-28T15:00:00.000Z"),
      end: new Date("2025-03-31T15:00:00.000Z"),
    });
    const leapDay = resolvePeriodRange("TODAY", clock("2028-02-29T03:00:00Z", TZ));
    expect(resolveComparisonRange("SAME_PERIOD_LAST_YEAR", leapDay)).toEqual({
      start: new Date("2027-02-28T15:00:00.000Z"), // 01/03/2027 00:00 JST
      end: new Date("2027-02-28T15:00:00.000Z"),
    });
  });

  it("monthsBetween usa os meses de Tóquio", () => {
    // 31/10 15:00Z = 01/11 00:00 JST -> só novembro em Tóquio.
    expect(monthsBetween(new Date("2026-10-31T15:00:00Z"), new Date("2026-11-30T15:00:00Z"), TZ)).toEqual([
      { year: 2026, month: 10 },
    ]);
    expect(monthsBetween(new Date("2026-10-31T15:00:00Z"), new Date("2026-11-30T15:00:00Z"), "UTC")).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
    ]);
  });
});

describe("empresa America/Sao_Paulo e UTC (fuso da empresa ≠ processo)", () => {
  it("São Paulo: 23:00 de 22/10 ainda é 22/10 (já é 23/10 em Tóquio e em UTC)", () => {
    const c = clock("2026-10-23T02:00:00Z", "America/Sao_Paulo");
    const today = resolvePeriodRange("TODAY", c);
    expect(iso(today.start)).toBe("2026-10-22T03:00:00.000Z");
    expect(iso(today.end)).toBe("2026-10-23T03:00:00.000Z");
    const month = resolvePeriodRange("THIS_MONTH", clock("2026-11-01T02:00:00Z", "America/Sao_Paulo")); // 31/10 23:00
    expect(month.months).toEqual([{ year: 2026, month: 9 }]);
    expect(iso(month.start)).toBe("2026-10-01T03:00:00.000Z");
    expect(iso(month.end)).toBe("2026-11-01T03:00:00.000Z");
  });

  it("UTC: 05:00 JST de 23/10 ainda é 22/10 para a empresa", () => {
    const c = clock("2026-10-22T20:00:00Z", "UTC");
    const today = resolvePeriodRange("TODAY", c);
    expect(iso(today.start)).toBe("2026-10-22T00:00:00.000Z");
    expect(iso(today.end)).toBe("2026-10-23T00:00:00.000Z");
    const month = resolvePeriodRange("THIS_MONTH", c);
    expect(iso(month.start)).toBe("2026-10-01T00:00:00.000Z");
    expect(iso(month.end)).toBe("2026-11-01T00:00:00.000Z");
    const lastMonth = resolvePeriodRange("LAST_MONTH", clock("2026-01-10T00:00:00Z", "UTC"));
    expect(lastMonth.months).toEqual([{ year: 2025, month: 11 }]);
    expect(iso(lastMonth.start)).toBe("2025-12-01T00:00:00.000Z");
  });
});

describe("America/New_York (horário de verão)", () => {
  const TZ = "America/New_York";

  it("período anterior de um CUSTOM de 15 dias que atravessa o início do horário de verão: 15 dias de calendário", () => {
    const range = resolvePeriodRange("CUSTOM", clock("2026-04-01T12:00:00Z", TZ), { start: "2026-03-16", end: "2026-03-30" });
    const previous = getPreviousPeriodRange(range);
    expect(iso(previous.start)).toBe("2026-03-01T05:00:00.000Z"); // 01/03 00:00 EST
    expect(iso(previous.end)).toBe("2026-03-16T04:00:00.000Z"); // 16/03 00:00 EDT
  });

  it("LAST_7_DAYS no dia seguinte ao fim do horário de verão", () => {
    const range = resolvePeriodRange("LAST_7_DAYS", clock("2026-11-02T15:00:00Z", TZ)); // 02/11 10:00 EST
    expect(iso(range.start)).toBe("2026-10-27T04:00:00.000Z"); // 27/10 00:00 EDT
    expect(iso(range.end)).toBe("2026-11-03T05:00:00.000Z"); // 03/11 00:00 EST
  });
});

describe("parseCustomRangeParams devolve datas de calendário", () => {
  it("valida as datas sem depender de fuso", () => {
    expect(parseCustomRangeParams("2026-02-28", "2026-03-01")).toEqual({ start: "2026-02-28", end: "2026-03-01" });
    expect(parseCustomRangeParams("2026-02-30", "2026-03-01")).toBeUndefined();
    expect(parseCustomRangeParams("2026-3-1", "2026-03-02")).toBeUndefined();
    expect(parseCustomRangeParams("2026-03-02", "2026-03-01")).toBeUndefined();
  });
});

describe("insights no fuso da empresa", () => {
  it("getPeriodKey: o mês de 30/09 15:30Z é outubro em Tóquio e setembro em UTC", () => {
    expect(getPeriodKey(new Date("2026-09-30T15:30:00Z"), "Asia/Tokyo")).toBe("2026-10");
    expect(getPeriodKey(new Date("2026-09-30T15:30:00Z"), "UTC")).toBe("2026-09");
  });

  it("resolveInsightPeriods (empresa Tóquio, 01:00 JST de 01/10): mês corrente = outubro, recorte do anterior = 01/09 inteiro", () => {
    const { current, previousClipped, isPartial } = resolveInsightPeriods(clock("2026-09-30T16:00:00Z", "Asia/Tokyo"));
    expect(iso(current.start)).toBe("2026-09-30T15:00:00.000Z");
    expect(iso(previousClipped.start)).toBe("2026-08-31T15:00:00.000Z"); // 01/09 JST
    expect(iso(previousClipped.end)).toBe("2026-09-01T15:00:00.000Z"); // até 01/09 inclusive
    expect(isPartial).toBe(true);
  });

  it("clipToSameDayOfMonth clampa fevereiro no fuso da empresa", () => {
    const feb = { start: new Date("2026-01-31T15:00:00Z"), end: new Date("2026-02-28T15:00:00Z") }; // fevereiro em Tóquio
    expect(clipToSameDayOfMonth(feb, 31, "Asia/Tokyo")).toEqual({ start: feb.start, end: new Date("2026-02-28T15:00:00Z") });
    expect(clipToSameDayOfMonth(feb, 10, "Asia/Tokyo").end).toEqual(new Date("2026-02-10T15:00:00Z")); // 11/02 JST
  });
});
