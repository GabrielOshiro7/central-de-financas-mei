import { describe, it, expect } from "vitest";
import { dayFromInput, dayRangeFilter } from "@/lib/finance/entryDay";
import { dateKeyToDbDate, dayRange, monthRange, startOfDayInstant } from "@/lib/time/zoned";

// Etapa F6b-2: o filtro de periodo sobre colunas de dia (occurredOn, dueOn,
// paidOn) so aceita limites que sejam EXATAMENTE 00:00 no fuso da empresa -
// um limite no meio do dia seria arredondado em silencio para o dia dele.
// Instantes absolutos: o resultado nao depende do fuso do processo.
describe("dayRangeFilter", () => {
  it("periodo alinhado (mes e dia, Tóquio e São Paulo): vira os dias [início, fim)", () => {
    expect(dayRangeFilter(monthRange(2026, 10, "Asia/Tokyo"), "Asia/Tokyo")).toEqual({
      gte: dateKeyToDbDate("2026-10-01"),
      lt: dateKeyToDbDate("2026-11-01"),
    });
    expect(dayRangeFilter(dayRange("2026-10-20", "America/Sao_Paulo"), "America/Sao_Paulo")).toEqual({
      gte: dateKeyToDbDate("2026-10-20"),
      lt: dateKeyToDbDate("2026-10-21"),
    });
  });

  it("periodo vazio em 00:00 (start === end) é aceito", () => {
    const today = startOfDayInstant("2026-10-30", "Asia/Tokyo");
    expect(dayRangeFilter({ start: today, end: today }, "Asia/Tokyo")).toEqual({
      gte: dateKeyToDbDate("2026-10-30"),
      lt: dateKeyToDbDate("2026-10-30"),
    });
  });

  it("início fora de 00:00 no fuso da empresa: erro claro", () => {
    const start = new Date("2026-10-20T06:00:00.000Z"); // 15:00 JST
    const end = startOfDayInstant("2026-10-21", "Asia/Tokyo");
    expect(() => dayRangeFilter({ start, end }, "Asia/Tokyo")).toThrow(
      'Filtro de período inválido: início (2026-10-20T06:00:00.000Z) não é o início de um dia em Asia/Tokyo.'
    );
  });

  it("fim fora de 00:00 no fuso da empresa: erro claro", () => {
    const start = startOfDayInstant("2026-10-20", "Asia/Tokyo");
    expect(() => dayRangeFilter({ start, end: new Date("2026-10-21T00:30:00.000Z") }, "Asia/Tokyo")).toThrow(/fim .* não é o início de um dia em Asia\/Tokyo/);
  });

  it("00:00 de OUTRO fuso não serve: meia-noite UTC não é o início do dia em Tóquio nem em São Paulo", () => {
    const utcMidnights = { start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-11-01T00:00:00.000Z") };
    expect(() => dayRangeFilter(utcMidnights, "Asia/Tokyo")).toThrow(RangeError);
    expect(() => dayRangeFilter(utcMidnights, "America/Sao_Paulo")).toThrow(RangeError);
    expect(dayRangeFilter(utcMidnights, "UTC")).toEqual({ gte: dateKeyToDbDate("2026-10-01"), lt: dateKeyToDbDate("2026-11-01") });
  });

  it("dia de início de horário de verão (New York, 08/03/2026): 00:00 existe e é aceito", () => {
    expect(dayRangeFilter(dayRange("2026-03-08", "America/New_York"), "America/New_York")).toEqual({
      gte: dateKeyToDbDate("2026-03-08"),
      lt: dateKeyToDbDate("2026-03-09"),
    });
  });
});

describe("dayFromInput", () => {
  it('"YYYY-MM-DD" é o próprio dia, em qualquer fuso', () => {
    for (const tz of ["Asia/Tokyo", "America/Sao_Paulo", "UTC"]) {
      expect(dayFromInput("2026-10-20", tz)).toBe("2026-10-20");
    }
  });

  it("outro formato (ISO com hora) vira o dia desse instante no fuso da empresa", () => {
    expect(dayFromInput("2026-10-26T20:30:00.000Z", "Asia/Tokyo")).toBe("2026-10-27");
    expect(dayFromInput("2026-10-26T20:30:00.000Z", "America/Sao_Paulo")).toBe("2026-10-26");
  });
});
