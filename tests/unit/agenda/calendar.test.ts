import { describe, it, expect } from "vitest";
import { agendaDateKey } from "@/lib/agenda/time";
import {
  agendaMonthRange,
  agendaDayRange,
  buildMonthGrid,
  groupAppointmentsByDay,
  hasVisibleAppointment,
  shiftDateKey,
} from "@/lib/agenda/calendar";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Fuso da empresa de teste: Asia/Tokyo (default da F2). Antes da F3c a Agenda
// usava o fuso fixo AGENDA_TIMEZONE = "Asia/Tokyo" - mesmo valor.
const BUSINESS_TZ = "Asia/Tokyo";

function countCells(weeks: unknown[][]): { total: number; filled: number } {
  const total = weeks.reduce((sum, week) => sum + week.length, 0);
  const filled = weeks.reduce((sum, week) => sum + week.filter((c) => c !== null).length, 0);
  return { total, filled };
}

describe("agendaMonthRange", () => {
  it("start/end corretos em UTC para um mes qualquer (novembro de 2026)", () => {
    const { start, end } = agendaMonthRange(2026, 11, BUSINESS_TZ);
    // 00:00 de 1/nov em Toquio = 2026-10-31T15:00:00Z (UTC+9).
    expect(start.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    // 00:00 de 1/dez em Toquio = 2026-11-30T15:00:00Z.
    expect(end.toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect((end.getTime() - start.getTime()) / MS_PER_DAY).toBe(30);
  });

  it("dezembro vira o ano corretamente (dezembro de 2026 -> janeiro de 2027)", () => {
    const december = agendaMonthRange(2026, 12, BUSINESS_TZ);
    const january = agendaMonthRange(2027, 1, BUSINESS_TZ);
    expect(december.end.toISOString()).toBe(january.start.toISOString());
    expect((december.end.getTime() - december.start.getTime()) / MS_PER_DAY).toBe(31);
  });
});

describe("buildMonthGrid", () => {
  it("mes comecando no domingo (novembro de 2026) - sem celulas vazias antes do dia 1", () => {
    const weeks = buildMonthGrid(2026, 11, BUSINESS_TZ);
    expect(weeks[0][0]?.dateKey).toBe("2026-11-01");
    expect(weeks[0][6]?.dateKey).toBe("2026-11-07");
    const { filled } = countCells(weeks);
    expect(filled).toBe(30);
  });

  it("mes comecando no sabado precisa de 6 semanas (agosto de 2026)", () => {
    const weeks = buildMonthGrid(2026, 8, BUSINESS_TZ);
    expect(weeks.length).toBe(6);
    // 6 celulas vazias antes do dia 1 (dom..sex), dia 1 cai no sabado.
    for (let i = 0; i < 6; i++) expect(weeks[0][i]).toBeNull();
    expect(weeks[0][6]?.dateKey).toBe("2026-08-01");
    const { filled } = countCells(weeks);
    expect(filled).toBe(31);
  });

  it("fevereiro de ano bissexto (2028) tem 29 dias na grade", () => {
    const weeks = buildMonthGrid(2028, 2, BUSINESS_TZ);
    const { filled } = countCells(weeks);
    expect(filled).toBe(29);
    const lastCell = weeks.flat().filter((c) => c !== null).at(-1);
    expect(lastCell?.dateKey).toBe("2028-02-29");
  });

  it("fevereiro de ano nao bissexto (2027) tem 28 dias na grade", () => {
    const weeks = buildMonthGrid(2027, 2, BUSINESS_TZ);
    const { filled } = countCells(weeks);
    expect(filled).toBe(28);
    const lastCell = weeks.flat().filter((c) => c !== null).at(-1);
    expect(lastCell?.dateKey).toBe("2027-02-28");
  });

  it("nenhum dia de outro mes aparece na grade (celulas de fora sao null)", () => {
    const weeks = buildMonthGrid(2026, 8, BUSINESS_TZ);
    const keys = weeks.flat().filter((c): c is NonNullable<typeof c> => c !== null).map((c) => c.dateKey);
    expect(keys.every((k) => k.startsWith("2026-08"))).toBe(true);
  });
});

describe("agendaDateKey / groupAppointmentsByDay", () => {
  it("00:30 de Toquio (15:30 UTC do dia anterior) cai no dia de Toquio", () => {
    // 15:30Z do dia 9 = 00:30 do dia 10 em Toquio (UTC+9).
    const instant = new Date("2026-09-09T15:30:00Z");
    expect(agendaDateKey(instant, BUSINESS_TZ)).toBe("2026-09-10");
  });

  it("23:59 de Toquio cai no mesmo dia de Toquio", () => {
    // 23:59 de 10/set em Toquio = 14:59Z do mesmo dia 10.
    const instant = new Date("2026-09-10T14:59:00Z");
    expect(agendaDateKey(instant, BUSINESS_TZ)).toBe("2026-09-10");
  });

  it("agrupa por dia de Toquio independente do fuso do processo", () => {
    const appointments = [
      { id: "a", startAt: new Date("2026-09-09T15:30:00Z") }, // 00:30 de 10/set em Toquio
      { id: "b", startAt: new Date("2026-09-10T14:59:00Z") }, // 23:59 de 10/set em Toquio
      { id: "c", startAt: new Date("2026-09-10T15:00:00Z") }, // 00:00 de 11/set em Toquio
    ];
    const groups = groupAppointmentsByDay(appointments, BUSINESS_TZ);
    expect(groups.get("2026-09-10")?.map((a) => a.id)).toEqual(["a", "b"]);
    expect(groups.get("2026-09-11")?.map((a) => a.id)).toEqual(["c"]);
  });
});

describe("hasVisibleAppointment - regra do pontinho", () => {
  it("dia so com CANCELADO nao tem ponto", () => {
    expect(hasVisibleAppointment([{ status: "CANCELADO" }])).toBe(false);
  });

  it("dia com CANCELADO + AGENDADO tem ponto", () => {
    expect(hasVisibleAppointment([{ status: "CANCELADO" }, { status: "AGENDADO" }])).toBe(true);
  });

  it("dia sem nenhum agendamento nao tem ponto", () => {
    expect(hasVisibleAppointment([])).toBe(false);
  });
});

describe("shiftDateKey / agendaDayRange", () => {
  it("soma e subtrai dias corretamente em viradas de mes/ano", () => {
    expect(shiftDateKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("agendaDayRange cobre exatamente [inicio do dia, inicio do dia seguinte) em Toquio", () => {
    const { start, end } = agendaDayRange("2026-09-10", BUSINESS_TZ);
    expect(agendaDateKey(start, BUSINESS_TZ)).toBe("2026-09-10");
    expect((end.getTime() - start.getTime()) / MS_PER_DAY).toBe(1);
  });
});
