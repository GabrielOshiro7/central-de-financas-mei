import { describe, it, expect } from "vitest";
import * as agendaTime from "@/lib/agenda/time";
import {
  AGENDA_WEEK_START_DAY,
  startOfAgendaDay,
  todayRange,
  startOfAgendaWeek,
  agendaWeekRange,
  startOfAgendaMonth,
  startOfNextAgendaMonth,
  agendaMonthRangeOf,
  parseAgendaDateTimeInput,
  agendaDateKey,
  formatAgendaDate,
  formatAgendaTime,
} from "@/lib/agenda/time";

// Fuso da empresa de teste: Asia/Tokyo (default da F2). Antes da F3c a Agenda
// usava o fuso fixo AGENDA_TIMEZONE = "Asia/Tokyo" - mesmo valor.
const BUSINESS_TZ = "Asia/Tokyo";

describe("agenda/time constantes", () => {
  // Etapa F3c: nao existe mais fuso fixo da Agenda - o fuso vem da empresa.
  // (Antes: expect(AGENDA_TIMEZONE).toBe("Asia/Tokyo").)
  it("nao existe mais fuso fixo (AGENDA_TIMEZONE foi removida)", () => {
    expect("AGENDA_TIMEZONE" in agendaTime).toBe(false);
  });

  it("semana comeca na segunda (1)", () => {
    expect(AGENDA_WEEK_START_DAY).toBe(1);
  });
});

describe("startOfAgendaDay - virada de dia em torno da meia-noite de Toquio", () => {
  // Asia/Tokyo = UTC+9. 2026-01-31T14:30Z = 23:30 de 31/jan em Toquio (ainda
  // dia 31). 2026-01-31T15:30Z = 00:30 de 1/fev em Toquio (ja virou o dia).
  it("2026-01-31T14:30Z ainda pertence ao dia 31 em Toquio", () => {
    const instant = new Date("2026-01-31T14:30:00Z");
    const start = startOfAgendaDay(instant, BUSINESS_TZ);
    // Meia-noite de 31/jan em Toquio = 2026-01-30T15:00:00Z.
    expect(start.toISOString()).toBe("2026-01-30T15:00:00.000Z");
    expect(agendaDateKey(instant, BUSINESS_TZ)).toBe("2026-01-31");
  });

  it("2026-01-31T15:30Z ja pertence ao dia 1/fev em Toquio", () => {
    const instant = new Date("2026-01-31T15:30:00Z");
    const start = startOfAgendaDay(instant, BUSINESS_TZ);
    // Meia-noite de 1/fev em Toquio = 2026-01-31T15:00:00Z.
    expect(start.toISOString()).toBe("2026-01-31T15:00:00.000Z");
    expect(agendaDateKey(instant, BUSINESS_TZ)).toBe("2026-02-01");
  });

  it("todayRange cobre exatamente [inicio do dia, inicio do dia seguinte)", () => {
    const instant = new Date("2026-01-31T15:30:00Z");
    const { start, end } = todayRange(instant, BUSINESS_TZ);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(agendaDateKey(start, BUSINESS_TZ)).toBe("2026-02-01");
  });
});

describe("fim de mes / virada de ano", () => {
  it("fevereiro de 2028 (bissexto) tem 29 dias em Toquio", () => {
    const start = startOfAgendaMonth(new Date("2028-02-15T12:00:00Z"), BUSINESS_TZ);
    const end = startOfNextAgendaMonth(new Date("2028-02-15T12:00:00Z"), BUSINESS_TZ);
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(29);
  });

  it("fevereiro de 2026 (nao bissexto) tem 28 dias em Toquio", () => {
    const start = startOfAgendaMonth(new Date("2026-02-15T12:00:00Z"), BUSINESS_TZ);
    const end = startOfNextAgendaMonth(new Date("2026-02-15T12:00:00Z"), BUSINESS_TZ);
    const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(28);
  });

  it("31/12/2026 vira 1/01/2027 (rollover de ano)", () => {
    const nextMonthStart = startOfNextAgendaMonth(new Date("2026-12-31T12:00:00Z"), BUSINESS_TZ);
    expect(agendaDateKey(nextMonthStart, BUSINESS_TZ)).toBe("2027-01-01");
  });

  it("agendaMonthRangeOf usa o mesmo par inicio/proximo-mes", () => {
    const { start, end } = agendaMonthRangeOf(new Date("2026-12-31T12:00:00Z"), BUSINESS_TZ);
    expect(agendaDateKey(start, BUSINESS_TZ)).toBe("2026-12-01");
    expect(agendaDateKey(end, BUSINESS_TZ)).toBe("2027-01-01");
  });
});

describe("semana comecando na segunda", () => {
  it("domingo 2026-09-20 pertence a semana que comeca na segunda 2026-09-14", () => {
    // Meio-dia UTC de 20/set (bem dentro do dia 20 em Toquio, sem risco de
    // fronteira) - confirmado externamente: 2026-09-20 e domingo, 2026-09-14
    // e segunda, 6 dias de distancia.
    const sunday = new Date("2026-09-20T12:00:00Z");
    const weekStart = startOfAgendaWeek(sunday, BUSINESS_TZ);
    expect(agendaDateKey(weekStart, BUSINESS_TZ)).toBe("2026-09-14");
  });

  it("a propria segunda 2026-09-14 e o inicio da sua semana", () => {
    const monday = new Date("2026-09-14T12:00:00Z");
    const weekStart = startOfAgendaWeek(monday, BUSINESS_TZ);
    expect(agendaDateKey(weekStart, BUSINESS_TZ)).toBe("2026-09-14");
  });

  it("agendaWeekRange cobre exatamente 7 dias", () => {
    const { start, end } = agendaWeekRange(new Date("2026-09-20T12:00:00Z"), BUSINESS_TZ);
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(agendaDateKey(start, BUSINESS_TZ)).toBe("2026-09-14");
    expect(agendaDateKey(end, BUSINESS_TZ)).toBe("2026-09-21");
  });
});

describe("agendamento atravessando a meia-noite de Toquio", () => {
  it("startAt as 23:30 e endAt 01:00 do dia seguinte caem em dias-calendario diferentes em Toquio", () => {
    const startAt = parseAgendaDateTimeInput("2026-06-10T23:30", BUSINESS_TZ);
    const endAt = parseAgendaDateTimeInput("2026-06-11T01:00", BUSINESS_TZ);
    expect(agendaDateKey(startAt, BUSINESS_TZ)).toBe("2026-06-10");
    expect(agendaDateKey(endAt, BUSINESS_TZ)).toBe("2026-06-11");
    expect(endAt.getTime() - startAt.getTime()).toBe(90 * 60 * 1000);
  });
});

describe("parseAgendaDateTimeInput", () => {
  it("interpreta o valor do input como horario de Toquio, nunca o fuso do processo", () => {
    const parsed = parseAgendaDateTimeInput("2026-01-31T09:00", BUSINESS_TZ);
    // 09:00 de Toquio = 00:00Z do mesmo dia (UTC+9).
    expect(parsed.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("rejeita formato invalido", () => {
    expect(() => parseAgendaDateTimeInput("2026-01-31", BUSINESS_TZ)).toThrow();
    expect(() => parseAgendaDateTimeInput("not-a-date", BUSINESS_TZ)).toThrow();
  });
});

describe("formatacao", () => {
  it("formatAgendaDate/formatAgendaTime formatam no fuso de Toquio, independente do host", () => {
    const instant = new Date("2026-01-31T15:30:00Z"); // 00:30 de 1/fev em Toquio
    expect(formatAgendaDate(instant, BUSINESS_TZ)).toBe("01/02/2026");
    expect(formatAgendaTime(instant, BUSINESS_TZ)).toBe("00:30");
  });
});
