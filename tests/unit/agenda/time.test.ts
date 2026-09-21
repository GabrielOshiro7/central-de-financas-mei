import { describe, it, expect } from "vitest";
import {
  AGENDA_TIMEZONE,
  AGENDA_WEEK_START_DAY,
  startOfDayTokyo,
  todayRangeTokyo,
  startOfWeekTokyo,
  weekRangeTokyo,
  startOfMonthTokyo,
  startOfNextMonthTokyo,
  monthRangeTokyo,
  parseTokyoDateTimeInput,
  formatTokyoDateKey,
  formatTokyoDate,
  formatTokyoTime,
} from "@/lib/agenda/time";

describe("agenda/time constantes", () => {
  it("fuso fixo e Asia/Tokyo", () => {
    expect(AGENDA_TIMEZONE).toBe("Asia/Tokyo");
  });

  it("semana comeca na segunda (1)", () => {
    expect(AGENDA_WEEK_START_DAY).toBe(1);
  });
});

describe("startOfDayTokyo - virada de dia em torno da meia-noite de Toquio", () => {
  // Asia/Tokyo = UTC+9. 2026-01-31T14:30Z = 23:30 de 31/jan em Toquio (ainda
  // dia 31). 2026-01-31T15:30Z = 00:30 de 1/fev em Toquio (ja virou o dia).
  it("2026-01-31T14:30Z ainda pertence ao dia 31 em Toquio", () => {
    const instant = new Date("2026-01-31T14:30:00Z");
    const start = startOfDayTokyo(instant);
    // Meia-noite de 31/jan em Toquio = 2026-01-30T15:00:00Z.
    expect(start.toISOString()).toBe("2026-01-30T15:00:00.000Z");
    expect(formatTokyoDateKey(instant)).toBe("2026-01-31");
  });

  it("2026-01-31T15:30Z ja pertence ao dia 1/fev em Toquio", () => {
    const instant = new Date("2026-01-31T15:30:00Z");
    const start = startOfDayTokyo(instant);
    // Meia-noite de 1/fev em Toquio = 2026-01-31T15:00:00Z.
    expect(start.toISOString()).toBe("2026-01-31T15:00:00.000Z");
    expect(formatTokyoDateKey(instant)).toBe("2026-02-01");
  });

  it("todayRangeTokyo cobre exatamente [inicio do dia, inicio do dia seguinte)", () => {
    const instant = new Date("2026-01-31T15:30:00Z");
    const { start, end } = todayRangeTokyo(instant);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(formatTokyoDateKey(start)).toBe("2026-02-01");
  });
});

describe("fim de mes / virada de ano", () => {
  it("fevereiro de 2028 (bissexto) tem 29 dias em Toquio", () => {
    const start = startOfMonthTokyo(new Date("2028-02-15T12:00:00Z"));
    const end = startOfNextMonthTokyo(new Date("2028-02-15T12:00:00Z"));
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(29);
  });

  it("fevereiro de 2026 (nao bissexto) tem 28 dias em Toquio", () => {
    const start = startOfMonthTokyo(new Date("2026-02-15T12:00:00Z"));
    const end = startOfNextMonthTokyo(new Date("2026-02-15T12:00:00Z"));
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(28);
  });

  it("31/12/2026 vira 1/01/2027 (rollover de ano)", () => {
    const nextMonthStart = startOfNextMonthTokyo(new Date("2026-12-31T12:00:00Z"));
    expect(formatTokyoDateKey(nextMonthStart)).toBe("2027-01-01");
  });

  it("monthRangeTokyo usa o mesmo par inicio/proximo-mes", () => {
    const { start, end } = monthRangeTokyo(new Date("2026-12-31T12:00:00Z"));
    expect(formatTokyoDateKey(start)).toBe("2026-12-01");
    expect(formatTokyoDateKey(end)).toBe("2027-01-01");
  });
});

describe("semana comecando na segunda", () => {
  it("domingo 2026-09-20 pertence a semana que comeca na segunda 2026-09-14", () => {
    // Meio-dia UTC de 20/set (bem dentro do dia 20 em Toquio, sem risco de
    // fronteira) - confirmado externamente: 2026-09-20 e domingo, 2026-09-14
    // e segunda, 6 dias de distancia.
    const sunday = new Date("2026-09-20T12:00:00Z");
    const weekStart = startOfWeekTokyo(sunday);
    expect(formatTokyoDateKey(weekStart)).toBe("2026-09-14");
  });

  it("a propria segunda 2026-09-14 e o inicio da sua semana", () => {
    const monday = new Date("2026-09-14T12:00:00Z");
    const weekStart = startOfWeekTokyo(monday);
    expect(formatTokyoDateKey(weekStart)).toBe("2026-09-14");
  });

  it("weekRangeTokyo cobre exatamente 7 dias", () => {
    const { start, end } = weekRangeTokyo(new Date("2026-09-20T12:00:00Z"));
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(formatTokyoDateKey(start)).toBe("2026-09-14");
    expect(formatTokyoDateKey(end)).toBe("2026-09-21");
  });
});

describe("agendamento atravessando a meia-noite de Toquio", () => {
  it("startAt as 23:30 e endAt 01:00 do dia seguinte caem em dias-calendario diferentes em Toquio", () => {
    const startAt = parseTokyoDateTimeInput("2026-06-10T23:30");
    const endAt = parseTokyoDateTimeInput("2026-06-11T01:00");
    expect(formatTokyoDateKey(startAt)).toBe("2026-06-10");
    expect(formatTokyoDateKey(endAt)).toBe("2026-06-11");
    expect(endAt.getTime() - startAt.getTime()).toBe(90 * 60 * 1000);
  });
});

describe("parseTokyoDateTimeInput", () => {
  it("interpreta o valor do input como horario de Toquio, nunca o fuso do processo", () => {
    const parsed = parseTokyoDateTimeInput("2026-01-31T09:00");
    // 09:00 de Toquio = 00:00Z do mesmo dia (UTC+9).
    expect(parsed.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("rejeita formato invalido", () => {
    expect(() => parseTokyoDateTimeInput("2026-01-31")).toThrow();
    expect(() => parseTokyoDateTimeInput("not-a-date")).toThrow();
  });
});

describe("formatacao", () => {
  it("formatTokyoDate/formatTokyoTime formatam no fuso de Toquio, independente do host", () => {
    const instant = new Date("2026-01-31T15:30:00Z"); // 00:30 de 1/fev em Toquio
    expect(formatTokyoDate(instant)).toBe("01/02/2026");
    expect(formatTokyoTime(instant)).toBe("00:30");
  });
});
