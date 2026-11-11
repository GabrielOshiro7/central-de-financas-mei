import { describe, it, expect } from "vitest";
import { resolvePeriodRange, type PeriodKey } from "@/lib/finance/period";

// Visao Geral: "Este mes" e "Este ano" vao do 1o dia ATE HOJE (inclusive; fim
// exclusivo = inicio de amanha) no fuso da empresa - opcao throughToday. Sem a
// opcao (demais paginas) continuam o mes/ano inteiro.
const jst = (key: string) => new Date(`${key}T00:00:00+09:00`);
const range = (period: PeriodKey, nowIso: string, timeZone = "Asia/Tokyo", throughToday = true) =>
  resolvePeriodRange(period, { now: new Date(nowIso), timeZone }, undefined, { throughToday });
const bounds = (r: { start: Date; end: Date }) => [r.start, r.end];

describe("Este mês até hoje", () => {
  it("meio do mês: 01/11 a 11/11 (fim exclusivo = 12/11 00:00)", () => {
    expect(bounds(range("THIS_MONTH", "2026-11-11T03:00:00Z"))).toEqual([jst("2026-11-01"), jst("2026-11-12")]);
  });

  it("dia 1: só o próprio dia", () => {
    expect(bounds(range("THIS_MONTH", "2026-11-01T03:00:00Z"))).toEqual([jst("2026-11-01"), jst("2026-11-02")]);
  });

  it("último dia do mês: o fim exclusivo é o dia 1 do mês seguinte (30/11 -> 01/12)", () => {
    expect(bounds(range("THIS_MONTH", "2026-11-30T03:00:00Z"))).toEqual([jst("2026-11-01"), jst("2026-12-01")]);
    expect(bounds(range("THIS_MONTH", "2028-02-29T03:00:00Z"))).toEqual([jst("2028-02-01"), jst("2028-03-01")]);
  });

  it("mantém os meses e o alinhamento de mês (série mensal, comparação por mês)", () => {
    const r = range("THIS_MONTH", "2026-11-11T03:00:00Z");
    expect([r.alignment, r.months]).toEqual(["month", [{ year: 2026, month: 10 }]]);
  });
});

describe("Este ano até hoje", () => {
  it("11/11/2026: 01/01 a 11/11, com os meses de janeiro a novembro", () => {
    const r = range("THIS_YEAR", "2026-11-11T03:00:00Z");
    expect(bounds(r)).toEqual([jst("2026-01-01"), jst("2026-11-12")]);
    expect(r.months).toHaveLength(11);
    expect(r.alignment).toBe("month");
  });

  it("31/12: o ano inteiro (fim exclusivo = 01/01 do ano seguinte)", () => {
    expect(bounds(range("THIS_YEAR", "2026-12-31T03:00:00Z"))).toEqual([jst("2026-01-01"), jst("2027-01-01")]);
  });

  it("01/01: só o próprio dia", () => {
    expect(bounds(range("THIS_YEAR", "2027-01-01T03:00:00Z"))).toEqual([jst("2027-01-01"), jst("2027-01-02")]);
  });
});

describe("o 'hoje' é o da empresa (00:30 JST)", () => {
  // 30/11 15:30Z = 01/12 00:30 em Tóquio, mas ainda 30/11 em UTC.
  const AFTER_MIDNIGHT_JST = "2026-11-30T15:30:00Z";

  it("Este mês: Tóquio já está em dezembro (01/12 a 01/12); UTC ainda em novembro (01/11 a 30/11)", () => {
    expect(bounds(range("THIS_MONTH", AFTER_MIDNIGHT_JST, "Asia/Tokyo"))).toEqual([jst("2026-12-01"), jst("2026-12-02")]);
    expect(bounds(range("THIS_MONTH", AFTER_MIDNIGHT_JST, "UTC"))).toEqual([
      new Date("2026-11-01T00:00:00Z"),
      new Date("2026-12-01T00:00:00Z"),
    ]);
  });

  it("Este ano: 31/12 15:30Z = 01/01 00:30 JST -> Tóquio já no ano novo (só 01/01); UTC ainda em 31/12 (ano inteiro)", () => {
    expect(bounds(range("THIS_YEAR", "2026-12-31T15:30:00Z", "Asia/Tokyo"))).toEqual([jst("2027-01-01"), jst("2027-01-02")]);
    expect(bounds(range("THIS_YEAR", "2026-12-31T15:30:00Z", "UTC"))).toEqual([
      new Date("2026-01-01T00:00:00Z"),
      new Date("2027-01-01T00:00:00Z"),
    ]);
  });
});

describe("só a opção muda: sem ela e nos outros períodos nada muda", () => {
  it("sem throughToday, Este mês/Este ano seguem o mês/ano inteiro", () => {
    expect(bounds(range("THIS_MONTH", "2026-11-11T03:00:00Z", "Asia/Tokyo", false))).toEqual([jst("2026-11-01"), jst("2026-12-01")]);
    expect(bounds(range("THIS_YEAR", "2026-11-11T03:00:00Z", "Asia/Tokyo", false))).toEqual([jst("2026-01-01"), jst("2027-01-01")]);
  });

  it("LAST_MONTH, LAST_3_MONTHS e LAST_YEAR são iguais com e sem a opção", () => {
    for (const period of ["LAST_MONTH", "LAST_3_MONTHS", "LAST_YEAR"] as PeriodKey[]) {
      expect(range(period, "2026-11-11T03:00:00Z", "Asia/Tokyo", true)).toEqual(range(period, "2026-11-11T03:00:00Z", "Asia/Tokyo", false));
    }
  });
});
