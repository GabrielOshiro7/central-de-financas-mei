import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  addDays,
  addMonthsClamped,
  assertValidTimeZone,
  clockFor,
  compareKeys,
  dateKeyToDbDate,
  dayRange,
  dbDateToKey,
  formatDateKey,
  formatInstant,
  isDateKey,
  isValidTimeZone,
  lastDayOfMonth,
  monthRange,
  parseDateTimeInput,
  startOfDayInstant,
  startOfDayOf,
  toDateKey,
  todayKey,
  weekRange,
  weekdayOf,
  zonedInstant,
  zonedParts,
} from "@/lib/time/zoned";

// Todos os instantes sao fixos (nunca o relogio real) e escritos em UTC
// explicito (sufixo Z), para o resultado nao depender do TZ do processo -
// esta suite roda na matriz TZ=UTC / Asia/Tokyo / America/New_York.
const at = (iso: string) => new Date(iso);
const HOUR = 60 * 60 * 1000;
const hoursOf = (range: { start: Date; end: Date }) => (range.end.getTime() - range.start.getTime()) / HOUR;

describe("validação de fuso", () => {
  it("aceita IANA válido e recusa inválido com erro claro", () => {
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(() => assertValidTimeZone("Marte/Olympus")).toThrow(/Fuso horário inválido: "Marte\/Olympus"/);
  });

  it("toda função com fuso recusa fuso inválido", () => {
    expect(() => toDateKey(at("2026-10-23T00:00:00Z"), "Marte/Olympus")).toThrow(RangeError);
    expect(() => startOfDayInstant("2026-10-23", "Marte/Olympus")).toThrow(RangeError);
    expect(() => formatInstant(at("2026-10-23T00:00:00Z"), "Marte/Olympus", { day: "2-digit" })).toThrow(RangeError);
    expect(() => clockFor({ timezone: "Marte/Olympus" })).toThrow(RangeError);
  });
});

describe("Asia/Tokyo (sem horário de verão)", () => {
  const TZ = "Asia/Tokyo";

  it("virada de dia: 23:59:59.999 ainda é o dia; 00:00:00.000 já é o seguinte", () => {
    expect(toDateKey(at("2026-10-22T14:59:59.999Z"), TZ)).toBe("2026-10-22");
    expect(toDateKey(at("2026-10-22T15:00:00.000Z"), TZ)).toBe("2026-10-23");
  });

  it("00:00–09:00 JST: o instante ainda está no dia anterior em UTC, mas o dia é o de Tóquio", () => {
    const fiveAmJst = at("2026-10-22T20:00:00Z"); // 05:00 de 23/10 em Tóquio
    expect(fiveAmJst.toISOString().slice(0, 10)).toBe("2026-10-22");
    expect(toDateKey(fiveAmJst, TZ)).toBe("2026-10-23");
    expect(todayKey({ timeZone: TZ, now: fiveAmJst })).toBe("2026-10-23");
  });

  it("início/fim do dia", () => {
    expect(startOfDayInstant("2026-10-23", TZ).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    const range = dayRange("2026-10-23", TZ);
    expect(range.end.toISOString()).toBe("2026-10-23T15:00:00.000Z");
    expect(hoursOf(range)).toBe(24);
    expect(startOfDayOf(at("2026-10-23T14:00:00Z"), TZ).toISOString()).toBe("2026-10-22T15:00:00.000Z");
  });

  it("início/fim do mês e virada de ano", () => {
    const dec = monthRange(2026, 12, TZ);
    expect(dec.start.toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(dec.end.toISOString()).toBe("2026-12-31T15:00:00.000Z"); // 01/01/2027 00:00 JST
    expect(toDateKey(at("2026-12-31T14:59:59.999Z"), TZ)).toBe("2026-12-31");
    expect(toDateKey(at("2026-12-31T15:00:00.000Z"), TZ)).toBe("2027-01-01");
  });

  it("29 de fevereiro", () => {
    const feb2028 = monthRange(2028, 2, TZ);
    expect(feb2028.end.toISOString()).toBe("2028-02-29T15:00:00.000Z"); // 01/03 00:00 JST
    expect(hoursOf(feb2028)).toBe(29 * 24);
    expect(hoursOf(monthRange(2027, 2, TZ))).toBe(28 * 24);
    expect(toDateKey(at("2028-02-29T03:00:00Z"), TZ)).toBe("2028-02-29");
  });

  it("semana começando na segunda", () => {
    // 23/10/2026 é sexta.
    expect(weekdayOf("2026-10-23")).toBe(5);
    const week = weekRange("2026-10-23", TZ, 1);
    expect(week.start.toISOString()).toBe("2026-10-18T15:00:00.000Z"); // segunda 19/10 00:00 JST
    expect(week.end.toISOString()).toBe("2026-10-25T15:00:00.000Z");
    expect(weekRange("2026-10-23", TZ, 0).start.toISOString()).toBe("2026-10-17T15:00:00.000Z"); // domingo 18/10
  });

  it("equivale à fórmula antiga do time.ts (offset fixo +9h) em 2000–2100", () => {
    for (let t = Date.UTC(2000, 0, 1); t < Date.UTC(2101, 0, 1); t += 37 * 24 * HOUR + 7 * HOUR + 13 * 60 * 1000) {
      const d = new Date(t + 9 * HOUR); // relógio de Tóquio lido via getters UTC
      const [y, m, day, h, mi] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
      expect(zonedInstant(TZ, y, m, day, h, mi).getTime()).toBe(Date.UTC(y, m - 1, day, h, mi) - 9 * HOUR);
      expect(toDateKey(new Date(t), TZ)).toBe(d.toISOString().slice(0, 10));
    }
  });

  it("normaliza componentes fora do intervalo como Date.UTC", () => {
    expect(zonedInstant(TZ, 2026, 13, 1).toISOString()).toBe("2026-12-31T15:00:00.000Z"); // = 01/01/2027
    expect(zonedInstant(TZ, 2026, 3, 0).toISOString()).toBe("2026-02-27T15:00:00.000Z"); // = 28/02
  });
});

describe("America/Sao_Paulo", () => {
  const TZ = "America/Sao_Paulo";

  it("UTC-3 (sem horário de verão desde 2019)", () => {
    expect(startOfDayInstant("2026-10-23", TZ).toISOString()).toBe("2026-10-23T03:00:00.000Z");
    expect(toDateKey(at("2026-10-24T02:59:59.999Z"), TZ)).toBe("2026-10-23");
    expect(toDateKey(at("2026-10-24T03:00:00.000Z"), TZ)).toBe("2026-10-24");
    expect(hoursOf(dayRange("2026-10-23", TZ))).toBe(24);
  });

  it("horário de verão que começava à meia-noite (04/11/2018): o dia começa no primeiro instante que existe", () => {
    // 00:00 de 04/11/2018 não existiu (pulou para 01:00 BRST = 03:00Z).
    const range = dayRange("2018-11-04", TZ);
    expect(range.start.toISOString()).toBe("2018-11-04T03:00:00.000Z");
    expect(toDateKey(range.start, TZ)).toBe("2018-11-04");
    expect(toDateKey(new Date(range.start.getTime() - 1), TZ)).toBe("2018-11-03");
    expect(hoursOf(range)).toBe(23);
  });
});

describe("America/New_York (com horário de verão)", () => {
  const TZ = "America/New_York";

  it("dia de 23h (08/03/2026, 02:00 → 03:00)", () => {
    const range = dayRange("2026-03-08", TZ);
    expect(range.start.toISOString()).toBe("2026-03-08T05:00:00.000Z"); // 00:00 EST
    expect(range.end.toISOString()).toBe("2026-03-09T04:00:00.000Z"); // 00:00 EDT
    expect(hoursOf(range)).toBe(23);
  });

  it("dia de 25h (01/11/2026, 02:00 → 01:00)", () => {
    const range = dayRange("2026-11-01", TZ);
    expect(range.start.toISOString()).toBe("2026-11-01T04:00:00.000Z"); // 00:00 EDT
    expect(range.end.toISOString()).toBe("2026-11-02T05:00:00.000Z"); // 00:00 EST
    expect(hoursOf(range)).toBe(25);
  });

  it("horário inexistente avança; horário repetido usa a primeira ocorrência", () => {
    expect(zonedInstant(TZ, 2026, 3, 8, 2, 30).toISOString()).toBe("2026-03-08T07:30:00.000Z"); // 03:30 EDT
    expect(zonedInstant(TZ, 2026, 11, 1, 1, 30).toISOString()).toBe("2026-11-01T05:30:00.000Z"); // 01:30 EDT
    expect(parseDateTimeInput("2026-11-01T01:30", TZ).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });

  it("início/fim do mês com transição dentro do mês", () => {
    const march = monthRange(2026, 3, TZ);
    expect(march.start.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(march.end.toISOString()).toBe("2026-04-01T04:00:00.000Z");
    expect(hoursOf(march)).toBe(31 * 24 - 1);
  });
});

describe("Europe/London e Europe/Lisbon", () => {
  it("London: dia de 23h (29/03/2026) e de 25h (25/10/2026)", () => {
    const TZ = "Europe/London";
    const spring = dayRange("2026-03-29", TZ);
    expect(spring.start.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(spring.end.toISOString()).toBe("2026-03-29T23:00:00.000Z");
    expect(hoursOf(spring)).toBe(23);
    const autumn = dayRange("2026-10-25", TZ);
    expect(autumn.start.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(autumn.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(hoursOf(autumn)).toBe(25);
  });

  it("Lisbon segue as mesmas transições", () => {
    expect(hoursOf(dayRange("2026-03-29", "Europe/Lisbon"))).toBe(23);
    expect(hoursOf(dayRange("2026-10-25", "Europe/Lisbon"))).toBe(25);
  });
});

describe("fusos com deslocamento não inteiro", () => {
  it("Asia/Kolkata (+05:30)", () => {
    const TZ = "Asia/Kolkata";
    expect(startOfDayInstant("2026-10-23", TZ).toISOString()).toBe("2026-10-22T18:30:00.000Z");
    expect(toDateKey(at("2026-10-22T18:29:59.999Z"), TZ)).toBe("2026-10-22");
    expect(toDateKey(at("2026-10-22T18:30:00.000Z"), TZ)).toBe("2026-10-23");
    expect(zonedParts(at("2026-10-22T18:30:00.000Z"), TZ)).toMatchObject({ hour: 0, minute: 0 });
  });

  it("Australia/Lord_Howe (horário de verão de 30 min, 04/10/2026)", () => {
    const range = dayRange("2026-10-04", "Australia/Lord_Howe");
    expect(range.start.toISOString()).toBe("2026-10-03T13:30:00.000Z"); // 00:00 +10:30
    expect(range.end.toISOString()).toBe("2026-10-04T13:00:00.000Z"); // 00:00 +11:00
    expect(hoursOf(range)).toBe(23.5);
  });
});

describe("iterar dias atravessando o horário de verão: nenhum dia pulado ou duplicado", () => {
  for (const TZ of ["America/New_York", "Europe/London", "America/Sao_Paulo", "Asia/Tokyo", "Asia/Kolkata"]) {
    it(`${TZ}: 2026 inteiro`, () => {
      const keys: string[] = [];
      let key = "2026-01-01";
      let previousEnd: number | null = null;
      while (key < "2027-01-01") {
        const range = dayRange(key, TZ);
        if (previousEnd !== null) expect(range.start.getTime()).toBe(previousEnd);
        expect(toDateKey(range.start, TZ)).toBe(key);
        expect(toDateKey(new Date(range.end.getTime() - 1), TZ)).toBe(key);
        expect([23, 24, 25]).toContain(hoursOf(range));
        keys.push(key);
        previousEnd = range.end.getTime();
        key = addDays(key, 1);
      }
      expect(keys).toHaveLength(365);
      expect(new Set(keys).size).toBe(365);
    });
  }
});

describe("aritmética de calendário (sem fuso)", () => {
  it("addDays: virada de mês, de ano e 29/02", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("addMonthsClamped nunca rola para o mês seguinte", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonthsClamped("2028-02-29", 12)).toBe("2029-02-28");
  });

  it("lastDayOfMonth e isDateKey", () => {
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2027, 2)).toBe(28);
    expect(lastDayOfMonth(2100, 2)).toBe(28);
    expect(lastDayOfMonth(2000, 2)).toBe(29);
    expect(isDateKey("2028-02-29")).toBe(true);
    expect(isDateKey("2027-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-1-01")).toBe(false);
    expect(() => addDays("2027-02-29", 1)).toThrow(/Data de calendario invalida/);
  });

  it("compareKeys", () => {
    expect(compareKeys("2026-10-22", "2026-10-23")).toBe(-1);
    expect(compareKeys("2026-10-23", "2026-10-23")).toBe(0);
    expect(compareKeys("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("ponte com colunas @db.Date e formatação", () => {
  it("DateKey <-> Date à 00:00 UTC", () => {
    expect(dateKeyToDbDate("2026-10-20").toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(dbDateToKey(dateKeyToDbDate("2028-02-29"))).toBe("2028-02-29");
  });

  it("formatDateKey não depende de fuso", () => {
    expect(formatDateKey("2026-10-02")).toBe("02/10/2026");
    expect(formatDateKey("2026-10-02", "long")).toBe("2 de outubro de 2026");
  });

  it("formatInstant usa o fuso do parâmetro", () => {
    const instant = at("2026-10-22T20:00:00Z");
    expect(formatInstant(instant, "Asia/Tokyo", { hour: "2-digit", minute: "2-digit", hour12: false })).toBe("05:00");
    expect(formatInstant(instant, "America/Sao_Paulo", { hour: "2-digit", minute: "2-digit", hour12: false })).toBe("17:00");
    expect(formatInstant(instant, "Asia/Tokyo", { day: "2-digit", month: "2-digit", year: "numeric" })).toBe("23/10/2026");
  });

  it("clockFor + todayKey", () => {
    const clock = clockFor({ timezone: "America/New_York" }, at("2026-10-23T03:30:00Z"));
    expect(todayKey(clock)).toBe("2026-10-22"); // 23:30 de 22/10 em New York
  });
});

describe("guarda estática do módulo", () => {
  it("src/lib/time/zoned.ts não usa getters/setters locais, toLocale* nem new Date(\"YYYY-MM-DD\")", () => {
    const source = readFileSync(join(process.cwd(), "src", "lib", "time", "zoned.ts"), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const forbidden =
      /\.(getDate|getDay|getHours|getMinutes|getSeconds|getMonth|getFullYear|getTimezoneOffset|setDate|setHours|setMinutes|setMonth|setFullYear|toLocaleString|toLocaleDateString|toLocaleTimeString)\s*\(/;
    expect(source).not.toMatch(forbidden);
    expect(source).not.toMatch(/new Date\(\s*["'`]/);
  });
});
