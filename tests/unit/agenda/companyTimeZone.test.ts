import { describe, it, expect } from "vitest";
import {
  agendaDateKey,
  agendaWeekRange,
  formatAgendaDateLong,
  formatAgendaTime,
  parseAgendaDateTimeInput,
  todayRange,
} from "@/lib/agenda/time";
import { agendaDayRange, agendaMonthRange, buildMonthGrid, groupAppointmentsByDay } from "@/lib/agenda/calendar";
import { resolveSaleDateFromAppointment } from "@/lib/agenda/calculations";

// Etapa F3c: dia/hora da Agenda no FUSO DA EMPRESA (antes fixo em Asia/Tokyo).
// Instantes em UTC explicito: o resultado nao depende do fuso do processo.
const SP = "America/Sao_Paulo"; // UTC-3, sem horario de verao desde 2019
const TOKYO = "Asia/Tokyo";

describe("Agenda com empresa em São Paulo", () => {
  it("o horário digitado no formulário é interpretado em São Paulo", () => {
    expect(parseAgendaDateTimeInput("2026-10-20T09:00", SP).toISOString()).toBe("2026-10-20T12:00:00.000Z");
    expect(parseAgendaDateTimeInput("2026-10-20T09:00", TOKYO).toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("dia e hora exibidos seguem São Paulo: 21/10 02:30Z é 20/10 23:30 em SP (e já 21/10 11:30 em Tóquio)", () => {
    const instant = new Date("2026-10-21T02:30:00Z");
    expect(agendaDateKey(instant, SP)).toBe("2026-10-20");
    expect(formatAgendaTime(instant, SP)).toBe("23:30");
    expect(formatAgendaDateLong(instant, SP)).toBe("20 de outubro de 2026");
    expect(agendaDateKey(instant, TOKYO)).toBe("2026-10-21");
    expect(formatAgendaTime(instant, TOKYO)).toBe("11:30");
  });

  it("agrupamento por dia (Calendário/Mês) usa o dia de São Paulo", () => {
    const items = [
      { id: "a", startAt: new Date("2026-10-21T02:30:00Z") }, // 20/10 23:30 SP
      { id: "b", startAt: new Date("2026-10-21T03:00:00Z") }, // 21/10 00:00 SP
    ];
    const sp = groupAppointmentsByDay(items, SP);
    expect(sp.get("2026-10-20")?.map((i) => i.id)).toEqual(["a"]);
    expect(sp.get("2026-10-21")?.map((i) => i.id)).toEqual(["b"]);
    const tokyo = groupAppointmentsByDay(items, TOKYO);
    expect(tokyo.get("2026-10-21")?.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("ranges de dia, semana e mês começam à meia-noite de São Paulo", () => {
    const day = agendaDayRange("2026-10-20", SP);
    expect(day.start.toISOString()).toBe("2026-10-20T03:00:00.000Z");
    expect(day.end.toISOString()).toBe("2026-10-21T03:00:00.000Z");

    const month = agendaMonthRange(2026, 10, SP);
    expect(month.start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(month.end.toISOString()).toBe("2026-11-01T03:00:00.000Z");

    // "Hoje" às 23:30 de 20/10 em SP (02:30Z de 21/10): ainda é 20/10.
    const now = new Date("2026-10-21T02:30:00Z");
    expect(todayRange(now, SP).start.toISOString()).toBe("2026-10-20T03:00:00.000Z");
    expect(todayRange(now, TOKYO).start.toISOString()).toBe("2026-10-20T15:00:00.000Z");
    // Semana (segunda a domingo) de terça 20/10 em SP.
    const week = agendaWeekRange(now, SP);
    expect(week.start.toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-10-26T03:00:00.000Z");
  });

  it("grade do mês: mesma grade de calendário, células à meia-noite de São Paulo", () => {
    const weeks = buildMonthGrid(2026, 10, SP);
    const cells = weeks.flat().filter((c): c is NonNullable<typeof c> => c !== null);
    expect(cells).toHaveLength(31);
    expect(weeks[0][4]?.dateKey).toBe("2026-10-01"); // quinta-feira
    expect(cells[0].date.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(buildMonthGrid(2026, 10, TOKYO).map((w) => w.map((c) => c?.dateKey ?? null))).toEqual(
      weeks.map((w) => w.map((c) => c?.dateKey ?? null))
    );
  });

  it("saleDate de um atendimento às 23:30 de 20/10 em SP é o dia 20/10 (em Tóquio já seria 21/10)", () => {
    const startAt = new Date("2026-10-21T02:30:00Z");
    expect(resolveSaleDateFromAppointment(startAt, SP).toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(resolveSaleDateFromAppointment(startAt, TOKYO).toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });
});
