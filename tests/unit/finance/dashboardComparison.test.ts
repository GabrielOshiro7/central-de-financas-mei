import { describe, it, expect } from "vitest";
import { DASHBOARD_PERIOD_OPTIONS, resolveDashboardComparisonRange, resolvePeriodRange, type PeriodKey } from "@/lib/finance/period";
import { clipToSameDayOfMonth } from "@/lib/insights/snapshot";

// Intervalo de comparacao da Visao Geral: sempre o "periodo anterior equivalente",
// resolvido no fuso da empresa (DateKey). Instantes escritos com o offset do fuso
// para ficarem legiveis (Tokyo = +09:00, sem horario de verao).
const TOKYO = "Asia/Tokyo";
const jst = (key: string) => new Date(`${key}T00:00:00+09:00`);

function compare(period: PeriodKey, nowIso: string, timeZone = TOKYO, custom?: { start: string; end: string }) {
  const clock = { now: new Date(nowIso), timeZone };
  // Como a Visao Geral resolve: Este mes / Este ano ate hoje (throughToday).
  const range = resolvePeriodRange(period, clock, custom, { throughToday: true });
  return resolveDashboardComparisonRange(period, range, clock);
}

describe("DASHBOARD_PERIOD_OPTIONS", () => {
  it("são exatamente as 6 opções, nesta ordem, com os rótulos da Visão Geral", () => {
    expect(DASHBOARD_PERIOD_OPTIONS).toEqual([
      { value: "THIS_MONTH", label: "Este mês" },
      { value: "LAST_MONTH", label: "Mês passado" },
      { value: "LAST_3_MONTHS", label: "Últimos 3 meses" },
      { value: "THIS_YEAR", label: "Este ano" },
      { value: "LAST_YEAR", label: "Ano passado" },
      { value: "CUSTOM", label: "Personalizado" },
    ]);
  });
});

describe("Este mês: o mês anterior do dia 1 até o MESMO dia de hoje", () => {
  it("15/03 -> 01/02 a 15/02", () => {
    expect(compare("THIS_MONTH", "2026-03-15T03:00:00Z")).toEqual({ start: jst("2026-02-01"), end: jst("2026-02-16") });
  });

  it("31/03 em ano comum -> fevereiro inteiro (01/02 a 28/02), sem vazar para março", () => {
    expect(compare("THIS_MONTH", "2026-03-31T03:00:00Z")).toEqual({ start: jst("2026-02-01"), end: jst("2026-03-01") });
  });

  it("31/03 em ano bissexto -> 01/02 a 29/02", () => {
    expect(compare("THIS_MONTH", "2028-03-31T03:00:00Z")).toEqual({ start: jst("2028-02-01"), end: jst("2028-03-01") });
  });

  it("31/05 -> 01/04 a 30/04 (mês de 30 dias)", () => {
    expect(compare("THIS_MONTH", "2026-05-31T03:00:00Z")).toEqual({ start: jst("2026-04-01"), end: jst("2026-05-01") });
  });

  it("virada de ano: 15/01 -> 01/12 a 15/12 do ano anterior", () => {
    expect(compare("THIS_MONTH", "2027-01-15T03:00:00Z")).toEqual({ start: jst("2026-12-01"), end: jst("2026-12-16") });
  });

  it("dia 1 -> só o dia 1 do mês anterior", () => {
    expect(compare("THIS_MONTH", "2026-04-01T03:00:00Z")).toEqual({ start: jst("2026-03-01"), end: jst("2026-03-02") });
  });

  it("reaproveita clipToSameDayOfMonth (a mesma função dos insights)", () => {
    const clock = { now: new Date("2026-03-31T03:00:00Z"), timeZone: TOKYO };
    const prevMonth = { start: jst("2026-02-01"), end: jst("2026-03-01") };
    expect(compare("THIS_MONTH", "2026-03-31T03:00:00Z")).toEqual(clipToSameDayOfMonth(prevMonth, 31, clock.timeZone));
  });
});

describe("Mês passado, Últimos 3 meses e Ano passado: os períodos anteriores completos", () => {
  it("Mês passado (fev) -> janeiro inteiro", () => {
    expect(compare("LAST_MONTH", "2026-03-10T03:00:00Z")).toEqual({ start: jst("2026-01-01"), end: jst("2026-02-01") });
  });

  it("Mês passado na virada de ano (dez) -> novembro inteiro", () => {
    expect(compare("LAST_MONTH", "2026-01-10T03:00:00Z")).toEqual({ start: jst("2025-11-01"), end: jst("2025-12-01") });
  });

  it("Últimos 3 meses (mar-mai) -> os 3 meses anteriores (dez-fev), completos", () => {
    expect(compare("LAST_3_MONTHS", "2026-05-20T03:00:00Z")).toEqual({ start: jst("2025-12-01"), end: jst("2026-03-01") });
  });

  it("Ano passado -> o ano anterior a ele, completo", () => {
    expect(compare("LAST_YEAR", "2026-11-10T03:00:00Z")).toEqual({ start: jst("2024-01-01"), end: jst("2025-01-01") });
  });
});

describe("Este ano: 1º/jan até o mesmo dia do ano anterior", () => {
  it("10/11/2026 -> 01/01/2025 a 10/11/2025", () => {
    expect(compare("THIS_YEAR", "2026-11-10T03:00:00Z")).toEqual({ start: jst("2025-01-01"), end: jst("2025-11-11") });
  });

  it("29/02/2028 (bissexto) -> até 28/02/2027", () => {
    expect(compare("THIS_YEAR", "2028-02-29T03:00:00Z")).toEqual({ start: jst("2027-01-01"), end: jst("2027-03-01") });
  });

  it("01/01 -> só o dia 01/01 do ano anterior", () => {
    expect(compare("THIS_YEAR", "2027-01-01T03:00:00Z")).toEqual({ start: jst("2026-01-01"), end: jst("2026-01-02") });
  });
});

describe("Personalizado: o intervalo de mesma quantidade de dias imediatamente anterior", () => {
  it("01/03 a 10/03 (10 dias) -> 19/02 a 28/02", () => {
    expect(compare("CUSTOM", "2026-03-20T03:00:00Z", TOKYO, { start: "2026-03-01", end: "2026-03-10" })).toEqual({
      start: jst("2026-02-19"),
      end: jst("2026-03-01"),
    });
  });

  it("um único dia -> o dia anterior; cruzando a virada de ano", () => {
    expect(compare("CUSTOM", "2026-03-20T03:00:00Z", TOKYO, { start: "2026-03-05", end: "2026-03-05" })).toEqual({
      start: jst("2026-03-04"),
      end: jst("2026-03-05"),
    });
    expect(compare("CUSTOM", "2026-03-20T03:00:00Z", TOKYO, { start: "2026-01-01", end: "2026-01-05" })).toEqual({
      start: jst("2025-12-27"),
      end: jst("2026-01-01"),
    });
  });
});

describe("o 'hoje' é o da empresa (00:30 JST)", () => {
  // 31/03 15:30Z = 01/04 00:30 em Tóquio, mas ainda 31/03 em UTC.
  const AFTER_MIDNIGHT_JST = "2026-03-31T15:30:00Z";

  it("Este mês: Tóquio já está em abril (compara 01/03 a 01/03); UTC ainda em março (01/02 a 28/02)", () => {
    expect(compare("THIS_MONTH", AFTER_MIDNIGHT_JST, "Asia/Tokyo")).toEqual({ start: jst("2026-03-01"), end: jst("2026-03-02") });
    expect(compare("THIS_MONTH", AFTER_MIDNIGHT_JST, "UTC")).toEqual({
      start: new Date("2026-02-01T00:00:00Z"),
      end: new Date("2026-03-01T00:00:00Z"),
    });
  });

  it("Este ano: 29/02/2028 15:30Z = 01/03 00:30 JST -> até 01/03/2027 em Tóquio; até 28/02/2027 em UTC", () => {
    expect(compare("THIS_YEAR", "2028-02-29T15:30:00Z", "Asia/Tokyo")).toEqual({ start: jst("2027-01-01"), end: jst("2027-03-02") });
    expect(compare("THIS_YEAR", "2028-02-29T15:30:00Z", "UTC")).toEqual({
      start: new Date("2027-01-01T00:00:00Z"),
      end: new Date("2027-03-01T00:00:00Z"),
    });
  });

  it("Mês passado: Tóquio (abril) -> o mês passado é março e a comparação, fevereiro", () => {
    expect(compare("LAST_MONTH", AFTER_MIDNIGHT_JST, "Asia/Tokyo")).toEqual({ start: jst("2026-02-01"), end: jst("2026-03-01") });
  });
});
