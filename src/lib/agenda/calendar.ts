// Redesign do calendario mensal da Agenda - funcoes puras (sem React), todas
// resolvidas em Asia/Tokyo via as primitivas ja existentes em time.ts (unica
// fonte de verdade do fuso). Mesma regra estatica de
// tests/unit/agenda/noLocalTimeUsage.test.ts se aplica aqui (este arquivo
// tambem vive em src/lib/agenda): nunca getHours/getDate/getDay/getMonth/
// getFullYear/setHours.
import type { AppointmentStatus } from "@prisma/client";
import { fromTokyoParts, tokyoWeekdayIndex, formatTokyoDateKey, type DateRange } from "@/lib/agenda/time";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Alias do mesmo formatTokyoDateKey de time.ts, sob o nome usado pela grade
// de calendario - mesma implementacao (Intl.DateTimeFormat com timeZone
// explicito), sem duplicar a logica de fuso.
export const tokyoDateKey = formatTokyoDateKey;

// Range [00:00 de Toquio do dia 1, 00:00 de Toquio do dia 1 do mes seguinte)
// - limite exclusivo, nunca mais que um mes. `month` e 1-indexado (janeiro=1),
// igual ao resto de src/lib/agenda.
export function tokyoMonthRange(year: number, month: number): DateRange {
  const start = fromTokyoParts(year, month, 1);
  const end = month === 12 ? fromTokyoParts(year + 1, 1, 1) : fromTokyoParts(year, month + 1, 1);
  return { start, end };
}

// Range [00:00 de Toquio do dia, 00:00 de Toquio do dia seguinte) a partir de
// uma chave "YYYY-MM-DD" - usado pela aba Dia (que navega dia a dia, nao so
// "hoje" como todayRangeTokyo em time.ts). Usa shiftDateKey pra calcular o
// dia seguinte (correto em viradas de mes/ano), nunca aritmetica local.
export function tokyoDayRange(dateKey: string): DateRange {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = fromTokyoParts(year, month, day);
  const [nextYear, nextMonth, nextDay] = shiftDateKey(dateKey, 1).split("-").map(Number);
  const end = fromTokyoParts(nextYear, nextMonth, nextDay);
  return { start, end };
}

export type MonthGridCell = { date: Date; dateKey: string };

// Grade domingo->sabado cobrindo o mes inteiro - celulas antes do dia 1 ou
// depois do ultimo dia do mes vem como `null` (dias de outros meses nunca sao
// mostrados, por decisao explicita do redesign). Numero de semanas varia (4 a
// 6 linhas) conforme o mes.
export function buildMonthGrid(year: number, month: number): (MonthGridCell | null)[][] {
  const { start: monthStart, end: monthEnd } = tokyoMonthRange(year, month);
  const firstWeekday = tokyoWeekdayIndex(monthStart); // 0 = domingo
  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / MS_PER_DAY);

  const cells: (MonthGridCell | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = fromTokyoParts(year, month, day);
    cells.push({ date, dateKey: tokyoDateKey(date) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (MonthGridCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Agrupa qualquer lista com `startAt` pelo dia-calendario de Toquio
// ("YYYY-MM-DD") - usado tanto pelo painel do dia no Calendario quanto pela
// lista por dia da aba Mes. Generico (nao amarra no shape de
// AppointmentListItem) para servir tanto a lista ja mapeada pra UI quanto o
// resultado cru do Prisma.
export function groupAppointmentsByDay<T extends { startAt: Date }>(appointments: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const appointment of appointments) {
    const key = tokyoDateKey(appointment.startAt);
    const group = map.get(key);
    if (group) group.push(appointment);
    else map.set(key, [appointment]);
  }
  return map;
}

// Soma/subtrai dias a uma chave "YYYY-MM-DD" - aritmetica pura sobre a
// propria chave (meio-dia UTC fixo, sem relacao com o instante real de
// nenhum agendamento em Toquio). Usada pra navegacao dia-a-dia (aba Dia) e
// pela navegacao por teclado da grade do Calendario - nunca para gravar/ler
// um agendamento, so para decidir qual dia mostrar/focar a seguir.
export function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day, 12));
  next.setUTCDate(next.getUTCDate() + days);
  const yyyy = String(next.getUTCFullYear()).padStart(4, "0");
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Regra do "pontinho" do calendario (secao 4 do redesign): um dia tem o
// indicador se tiver pelo menos um agendamento NAO cancelado - CANCELADO
// sozinho nao conta, mas FALTOU conta (diferente do filtro de
// detectOverlap em calculations.ts, que ignora tanto CANCELADO quanto
// FALTOU - regras diferentes, nao reaproveitar uma pra outra).
export function hasVisibleAppointment(appointments: { status: AppointmentStatus }[]): boolean {
  return appointments.some((a) => a.status !== "CANCELADO");
}
