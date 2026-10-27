import { describe, it, expect } from "vitest";
import { generateOccurrences, generateOccurrencesForEntry } from "@/lib/finance/recurring/occurrences";
import { generateBillOccurrences } from "@/lib/finance/bills/occurrences";
import { startOfDayInstant, weekdayOf } from "@/lib/time/zoned";

// Etapa F5: o motor de ocorrencias trabalha em dias de calendario (DateKey).
// Todas as entradas aqui sao instantes absolutos ou DateKeys - o resultado
// nao pode depender do TZ do processo (a matriz roda este arquivo em UTC,
// Asia/Tokyo e America/New_York sem mudar nada).

describe("mensal no dia 31 e fevereiro", () => {
  it("dia 31 em ano bissexto: 31/01, 29/02, 31/03, 30/04", () => {
    expect(
      generateOccurrences({ rule: { frequency: "MONTHLY", dayOfMonth: 31 }, startDate: "2028-01-01", uptoDate: "2028-04-30" })
    ).toEqual(["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
  });

  it("dia 30 em fevereiro comum vira 28/02 e volta a 30 em março", () => {
    expect(
      generateOccurrences({ rule: { frequency: "MONTHLY", dayOfMonth: 30 }, startDate: "2027-01-15", uptoDate: "2027-03-31" })
    ).toEqual(["2027-01-30", "2027-02-28", "2027-03-30"]);
  });
});

describe("semanal atravessando o horário de verão (os dias não mudam)", () => {
  it("New York, março e novembro de 2026: só segundas, de 7 em 7 dias de calendário", () => {
    const days = generateOccurrences({ rule: { frequency: "WEEKLY", dayOfWeek: 1 }, startDate: "2026-03-01", uptoDate: "2026-11-10" });
    expect(days[0]).toBe("2026-03-02");
    expect(days).toContain("2026-03-09"); // primeira segunda depois do início do horário de verão (08/03)
    expect(days).toContain("2026-11-02"); // primeira segunda depois do fim (01/11)
    expect(days.at(-1)).toBe("2026-11-09");
    expect(days.every((d) => weekdayOf(d) === 1)).toBe(true);
    expect(days).toHaveLength(37);
  });
});

describe("borda com o banco: instantes do molde viram dia no fuso da EMPRESA", () => {
  const monthly1 = { frequency: "MONTHLY" as const, dayOfWeek: null, dayOfMonth: 1, yearMonth: null, endDate: null };

  for (const tz of ["Asia/Tokyo", "America/Sao_Paulo", "UTC", "America/New_York"]) {
    it(`${tz}: molde com início às 00:00 de 01/01 no fuso -> 01/01, 01/02, 01/03`, () => {
      const entry = { ...monthly1, startDate: startOfDayInstant("2026-01-01", tz) };
      const upto = startOfDayInstant("2026-03-01", tz); // exatamente 00:00 do último dia
      expect(generateOccurrencesForEntry(entry, upto, tz)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
      expect(generateBillOccurrences(entry, upto, tz)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    });
  }

  it("Tóquio na madrugada (05:30 JST = 20:30 UTC do dia anterior): o limite é o dia de Tóquio", () => {
    const entry = { ...monthly1, startDate: startOfDayInstant("2026-01-01", "Asia/Tokyo") };
    expect(generateOccurrencesForEntry(entry, new Date("2026-02-28T20:30:00.000Z"), "Asia/Tokyo")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    // O mesmo instante lido em UTC ainda e 28/02: 01/03 nao entra.
    expect(generateOccurrencesForEntry(entry, new Date("2026-02-28T20:30:00.000Z"), "UTC")).toEqual(["2026-01-01", "2026-02-01"]);
  });
});
